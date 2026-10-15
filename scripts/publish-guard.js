#!/usr/bin/env node
/**
 * Gate in front of EVERY phone update (OTA). An OTA replaces the app code on every phone that opens the app, so publishing from a stale or
 * half-edited folder silently deletes other people's work (happened 2026-10-06 and 2026-10-11).
 *
 *   node scripts/publish-guard.js --app driver|admin|vendor [--last-sha <sha>]
 *
 * It refuses (exit 1) unless ALL of these hold:
 *   1. the app folder has no uncommitted changes            (what is published is what is in git)
 *   2. the commit is pushed                                  (the next person starts from it)
 *   3. the commit CONTAINS the commit of the update that is live now (so nothing that is live can be dropped)
 *   4. scripts/regression-guard.js passes                    (no fix from docs/FIX_REGISTRY.json has been undone)
 * `git sha` of the live update comes from the update's own metadata (Driver: latest.json in the storage bucket; Admin / Vendor: pass
 * --last-sha, or it is read from the newest EAS update message "[sha1234567]").
 * Set OTA_UNSAFE=1 only in an emergency - it is logged loudly and the owner should be told.
 */
const { spawnSync } = require('child_process');
const https = require('https');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const app = opt('app', 'driver');
const APP_DIR = { driver: 'driver-app', admin: 'admin-panel', vendor: 'vendor-app' }[app];
if (!APP_DIR) { console.error(`unknown app "${app}"`); process.exit(2); }

const git = (...a) => spawnSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' });
const problems = [];

function fetchJson(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

(async () => {
  if (process.env.OTA_UNSAFE === '1') {
    console.error('\n!!! OTA_UNSAFE=1 - the safety checks are SKIPPED. Tell the owner you did this. !!!\n');
    process.exit(0);
  }
  const head = git('rev-parse', 'HEAD').stdout.trim();

  // 1. clean app folder
  const dirty = git('status', '--porcelain', '--untracked-files=no', '--', APP_DIR).stdout.trim();
  if (dirty) problems.push(`${APP_DIR}/ has uncommitted changes - commit them first (what is published must be what is in git):\n${dirty}`);

  // 2. pushed
  const remotes = git('branch', '-r', '--contains', head).stdout.trim();
  if (!remotes) problems.push(`commit ${head.slice(0, 10)} is not pushed. Run: git push`);

  // 3. contains the live update's commit
  let live = opt('last-sha', null);
  if (!live && app === 'driver') {
    const j = await fetchJson('https://storage.googleapis.com/drop-cars-apk-downloads/ota/driver/1.0.0/android/latest.json');
    live = j && j.metadata && j.metadata.gitSha;
    if (!live) console.warn('note: the live Driver update has no recorded commit (published before this gate existed) - ancestor check skipped this once.');
  }
  if (live) {
    const known = git('cat-file', '-e', `${live}^{commit}`).status === 0 || (git('fetch', '--all', '--quiet'), git('cat-file', '-e', `${live}^{commit}`).status === 0);
    if (!known) problems.push(`the live update was built from commit ${live}, which this clone does not have. Run: git fetch --all`);
    else if (git('merge-base', '--is-ancestor', live, head).status !== 0) problems.push(`your commit does not contain the live update (${live.slice(0, 10)}). Publishing would DELETE what is live. Merge it first: git merge ${live.slice(0, 10)}`);
  }

  // 4. regression guard
  const rg = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'regression-guard.js'), '--quiet'], { encoding: 'utf8' });
  if (rg.status !== 0) problems.push(`regression guard failed:\n${rg.stderr || rg.stdout}`);

  if (problems.length) {
    console.error(`\nSTOPPED - not publishing the ${app} update:\n`);
    problems.forEach((p, i) => console.error(`${i + 1}. ${p}\n`));
    process.exit(1);
  }
  console.log(`Publish gate OK for ${app} at ${head.slice(0, 10)} (clean, pushed, contains the live update, no fix undone).`);
  process.stdout.write(`GITSHA=${head}\n`);
})();
