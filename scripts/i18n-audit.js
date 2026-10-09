#!/usr/bin/env node
/**
 * scripts/i18n-audit.js
 * Standalone, zero-dependency Node CLI to audit untranslated English literals
 * in React Native UI files and report missing dictionary keys between languages.
 */

const fs = require('fs');
const path = require('path');

const APPS = ['driver-app', 'customer-app', 'vendor-app', 'admin-panel'];
const targetApp = process.argv[2] || 'all';

function getFiles(dir, exts = ['.tsx', '.ts', '.jsx', '.js']) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === 'node_modules' || item.name === '.expo' || item.name === 'android' || item.name === 'ios') continue;
      files = files.concat(getFiles(fullPath, exts));
    } else if (exts.includes(path.extname(item.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function loadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.warn(`[WARN] Could not parse JSON ${filePath}:`, e.message);
  }
  return null;
}

function auditApp(appName, rootDir) {
  const appDir = path.join(rootDir, appName);
  if (!fs.existsSync(appDir)) {
    console.log(`[SKIP] Directory ${appDir} does not exist.`);
    return null;
  }

  // Load language dictionaries
  const localesDir = path.join(appDir, 'locales');
  const languages = ['en', 'ta', 'te', 'kn', 'hi'];
  const dicts = {};
  for (const lang of languages) {
    dicts[lang] = loadJson(path.join(localesDir, `${lang}.json`)) || {};
    // Also check locales/ui/<lang>.json
    const uiDict = loadJson(path.join(localesDir, 'ui', `${lang}.json`));
    if (uiDict) {
      Object.assign(dicts[lang], uiDict);
    }
  }

  // Find missing keys across dicts
  const enKeys = Object.keys(dicts.en || {});
  const missingKeys = {};
  for (const lang of ['ta', 'te', 'kn', 'hi']) {
    const langKeys = new Set(Object.keys(dicts[lang] || {}));
    missingKeys[lang] = enKeys.filter(k => !langKeys.has(k));
  }

  // Scan UI source files
  const codeFiles = [
    ...getFiles(path.join(appDir, 'app')),
    ...getFiles(path.join(appDir, 'components')),
  ];

  const untranslatedLiterals = [];

  // Patterns to extract UI English text
  const textPattern = /<Text[^>]*>([^<{>\n\r]+)<\/Text>/g;
  const placeholderPattern = /placeholder=["']([^"']{2,})["']/g;
  const alertPattern = /Alert\.alert\(\s*["']([^"']+)["']\s*(?:,\s*["']([^"']+)["'])?/g;
  const accessibilityPattern = /accessibilityLabel=["']([^"']{2,})["']/g;

  for (const file of codeFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const relFile = path.relative(appDir, file).replace(/\\/g, '/');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      // 1. Text tag literals
      let m;
      textPattern.lastIndex = 0;
      while ((m = textPattern.exec(line)) !== null) {
        const text = m[1].trim();
        if (text && /^[A-Za-z]/.test(text) && !text.startsWith('{') && !text.includes('(') && text.length > 1) {
          // Check if key or text is in dictionary
          if (!dicts.ta[text] && !dicts.en[text]) {
            untranslatedLiterals.push({
              file: relFile,
              line: idx + 1,
              type: 'Text',
              literal: text,
            });
          }
        }
      }

      // 2. Alert literals
      alertPattern.lastIndex = 0;
      while ((m = alertPattern.exec(line)) !== null) {
        const title = (m[1] || '').trim();
        const body = (m[2] || '').trim();
        if (title && /^[A-Za-z]/.test(title) && !dicts.ta[title]) {
          untranslatedLiterals.push({ file: relFile, line: idx + 1, type: 'Alert Title', literal: title });
        }
        if (body && /^[A-Za-z]/.test(body) && !dicts.ta[body]) {
          untranslatedLiterals.push({ file: relFile, line: idx + 1, type: 'Alert Body', literal: body });
        }
      }

      // 3. Placeholder literals
      placeholderPattern.lastIndex = 0;
      while ((m = placeholderPattern.exec(line)) !== null) {
        const ph = m[1].trim();
        if (ph && /^[A-Za-z]/.test(ph) && !dicts.ta[ph]) {
          untranslatedLiterals.push({ file: relFile, line: idx + 1, type: 'Placeholder', literal: ph });
        }
      }
    });
  }

  return {
    appName,
    totalFilesScanned: codeFiles.length,
    dictCounts: {
      en: Object.keys(dicts.en).length,
      ta: Object.keys(dicts.ta).length,
      te: Object.keys(dicts.te).length,
      kn: Object.keys(dicts.kn).length,
      hi: Object.keys(dicts.hi).length,
    },
    missingKeys,
    untranslatedCount: untranslatedLiterals.length,
    untranslatedLiterals,
  };
}

function generateReport(report, docsDir) {
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  const outPath = path.join(docsDir, `${report.appName}-untranslated.md`);
  let md = `# i18n Translation Audit Report: ${report.appName}\n\n`;
  md += `Generated on: ${new Date().toISOString()}\n\n`;
  md += `## Dictionary Status\n`;
  md += `- **EN keys:** ${report.dictCounts.en}\n`;
  md += `- **TA (Tamil) keys:** ${report.dictCounts.ta}\n`;
  md += `- **TE (Telugu) keys:** ${report.dictCounts.te}\n`;
  md += `- **KN (Kannada) keys:** ${report.dictCounts.kn}\n`;
  md += `- **HI (Hindi) keys:** ${report.dictCounts.hi}\n\n`;

  md += `## Missing Keys Against English\n`;
  for (const lang of ['ta', 'te', 'kn', 'hi']) {
    const list = report.missingKeys[lang] || [];
    md += `- **${lang.toUpperCase()}:** ${list.length} missing keys\n`;
  }
  md += `\n`;

  md += `## Untranslated Hardcoded Literals (${report.untranslatedCount} items in ${report.totalFilesScanned} files)\n\n`;
  if (report.untranslatedLiterals.length === 0) {
    md += `*No untranslated English literals found! Clean 100% localization.* 🎉\n`;
  } else {
    md += `| File | Line | Type | English Literal |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    report.untranslatedLiterals.slice(0, 200).forEach(item => {
      md += `| \`${item.file}\` | ${item.line} | ${item.type} | "${item.literal.replace(/\|/g, '\\|')}" |\n`;
    });
    if (report.untranslatedLiterals.length > 200) {
      md += `\n*(Showing top 200 of ${report.untranslatedLiterals.length} untranslated literals)*\n`;
    }
  }

  fs.writeFileSync(outPath, md, 'utf8');
  console.log(`[OK] Generated report: ${outPath} (${report.untranslatedCount} untranslated literals found)`);
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const docsDir = path.join(rootDir, 'docs', 'i18n');

  const targets = targetApp === 'all' ? APPS : [targetApp];
  for (const app of targets) {
    console.log(`Auditing ${app}...`);
    const report = auditApp(app, rootDir);
    if (report) {
      generateReport(report, docsDir);
    }
  }
}

main();
