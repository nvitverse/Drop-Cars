#!/usr/bin/env node
/**
 * Regression guard - fails when a fix that was made once has been undone (by an old copy of a file, a bad merge, a stale tool).
 *
 *   node scripts/regression-guard.js            check everything
 *   node scripts/regression-guard.js --quiet    only print failures
 *
 * Two kinds of checks, no dependencies:
 *   1. docs/FIX_REGISTRY.json  - every entry names a file and text that MUST (or must NOT) be there, and why. When you fix something
 *      that has come back before, add a line. If a stale copy ever overwrites the fix, this fails in CI and before every OTA / deploy.
 *   2. Rules that apply to every file of an app (the mistakes that kept coming back):
 *        - a file with a text box must use the keyboard-safe Modal, never react-native's own Modal
 *        - no made-up phone numbers / sample data pasted into app code
 * Exit code 1 = something was undone; the output says exactly what, where and why.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const quiet = process.argv.includes('--quiet');
const APPS = ['driver-app', 'admin-panel', 'vendor-app', 'customer-app'];
const SKIP_DIRS = new Set(['node_modules', 'android', 'ios', 'dist', 'dist-ota', 'dist-web-preview', '.expo', '.git', 'build', '__tests__']);

const failures = [];
const fail = (id, where, msg) => failures.push({ id, where, msg });

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(name.name)) continue;
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name.name)) out.push(p);
  }
  return out;
}
const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

// ---- 1. the fix registry --------------------------------------------------------------------------------------------------------
const registryPath = path.join(ROOT, 'docs', 'FIX_REGISTRY.json');
const registry = JSON.parse(read(registryPath));
let checked = 0;
for (const e of registry.fixes) {
  const file = path.join(ROOT, e.file);
  if (!fs.existsSync(file)) { fail(e.id, e.file, `file is missing - ${e.why}`); continue; }
  const text = read(file);
  for (const needle of [].concat(e.must_contain || [])) {
    checked++;
    if (!text.includes(needle)) fail(e.id, e.file, `"${needle.slice(0, 70)}" is gone - ${e.why} (fixed ${e.since})`);
  }
  for (const needle of [].concat(e.must_not_contain || [])) {
    checked++;
    if (text.includes(needle)) fail(e.id, e.file, `"${needle.slice(0, 70)}" is back - ${e.why} (fixed ${e.since})`);
  }
}

// ---- 2. rules for every file of every app ---------------------------------------------------------------------------------------
const MODAL_OK = new Set(['components/KeyboardSafe.tsx', 'components/ui.tsx', 'components/WebAlertHost.tsx', 'components/ForceUpdateGate.tsx', 'components/WelcomeScreen.tsx', 'components/ui/Modal.tsx']);
const FAKE_NUMBER = /\b(9876543210|1234567890|0000000000)\b/;
const FAKE_OK = [/placeholder/i, /e\.g\./i, /for example/i, /\/\/.*(format|example)/i, /UPI/i, /Mobile number format/i];
for (const app of APPS) {
  const dir = path.join(ROOT, app);
  if (!fs.existsSync(dir)) continue;
  for (const f of walk(dir)) {
    const r = rel(f);
    const inApp = r.slice(app.length + 1);
    const text = read(f);
    // raw Modal in a file with a text box
    if (/\bTextInput\b/.test(text) && !MODAL_OK.has(inApp)) {
      const m = text.match(/import\s*\{([^}]*)\}\s*from\s*'react-native'/);
      if (m && /\bModal\b/.test(m[1])) fail('keyboard-safe-modal', r, "uses react-native's Modal with a text box - import Modal from '@/components/KeyboardSafe' (the keyboard / nav bar covers the box otherwise)");
    }
    // made-up numbers
    text.split('\n').forEach((line, i) => {
      if (FAKE_NUMBER.test(line) && !FAKE_OK.some((re) => re.test(line))) fail('no-made-up-numbers', `${r}:${i + 1}`, `made-up number in code: ${line.trim().slice(0, 90)}`);
    });
  }
}

// ---- report ---------------------------------------------------------------------------------------------------------------------
if (failures.length) {
  console.error(`\nREGRESSION GUARD: ${failures.length} problem(s) - something that was fixed has been undone or a known mistake is back:\n`);
  for (const f of failures) console.error(`  [${f.id}] ${f.where}\n      ${f.msg}`);
  console.error('\nDo NOT copy files from another folder over these. Re-apply the fix (see docs/FIX_REGISTRY.json), or - if the fix was removed on purpose - update the registry in the same commit.\n');
  process.exit(1);
}
if (!quiet) console.log(`Regression guard OK: ${registry.fixes.length} registered fixes (${checked} checks) + rules over ${APPS.length} apps.`);
