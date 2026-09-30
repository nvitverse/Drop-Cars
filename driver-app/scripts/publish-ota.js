#!/usr/bin/env node
/**
 * Publish an over-the-air (OTA) JavaScript update for this app - NO Play Store release, NO EAS subscription.
 *
 *   node scripts/publish-ota.js --app driver --message "Fix wallet screen"
 *   node scripts/publish-ota.js --app driver --rollback <updateId>      (put an earlier update back live)
 *   node scripts/publish-ota.js --app driver --list                     (show published updates)
 *
 * What it does: `expo export` (JS bundle + assets) -> uploads them to the public Google Cloud Storage bucket
 * gs://drop-cars-apk-downloads/ota/<app>/<runtimeVersion>/<updateId>/ -> writes latest.json, which the backend
 * (GET /api/app-updates/<app>/manifest) serves to installed apps. Phones pick the update up the next time the app opens.
 *
 * Works only for JS / asset changes. Anything native (new native package, AndroidManifest, permissions, app.json native
 * fields, expo SDK upgrade) needs a new APK/AAB - and then bump "runtimeVersion" in app.json so old phones do not
 * receive a bundle they cannot run.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const BUCKET = 'drop-cars-apk-downloads';
const PUBLIC = `https://storage.googleapis.com/${BUCKET}`;
const PROJECT = 'drop-cars2';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def;
};
const app = opt('app', 'driver');
const message = opt('message', '');
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist-ota');

const env = { ...process.env };
// gcloud on this machine needs the backend venv python (see the project notes)
const venvPython = path.resolve(root, '..', '..', 'backend', '.venv', 'Scripts', 'python.exe');
if (!env.CLOUDSDK_PYTHON && fs.existsSync(venvPython)) env.CLOUDSDK_PYTHON = venvPython;

function run(cmd, cmdArgs, options = {}) {
  // with shell:true (Windows) arguments that contain spaces must be quoted
  if (process.platform === 'win32') cmdArgs = cmdArgs.map((a) => (/[\s,]/.test(a) ? `"${a}"` : a));
  const r = spawnSync(cmd, cmdArgs, { cwd: root, env, shell: process.platform === 'win32', encoding: 'utf8', stdio: options.capture ? 'pipe' : 'inherit', ...options });
  if (r.status !== 0) {
    if (options.capture) console.error(r.stdout, r.stderr);
    throw new Error(`Command failed: ${cmd} ${cmdArgs.join(' ')}`);
  }
  return r.stdout;
}
const gcs = (...a) => run('gcloud', ['storage', ...a, '--project', PROJECT], { capture: true });

const mime = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', json: 'application/json', mp3: 'audio/mpeg', wav: 'audio/wav',
  m4a: 'audio/mp4', mp4: 'video/mp4', ogg: 'audio/ogg', bin: 'application/octet-stream', txt: 'text/plain', html: 'text/html',
};
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = (buf) => b64url(crypto.createHash('sha256').update(buf).digest());
const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

function runtimeVersionOf(expoConfig) {
  const rv = expoConfig.runtimeVersion;
  if (typeof rv !== 'string') throw new Error('runtimeVersion in app.json must be a plain string (e.g. "1.0.0")');
  return rv;
}

if (opt('list')) {
  const rvs = String(fs.readFileSync(path.join(root, 'app.json'), 'utf8').match(/"runtimeVersion":\s*"([^"]+)"/)?.[1] || '');
  console.log(gcs('ls', `gs://${BUCKET}/ota/${app}/${rvs}/android/history/`));
  process.exit(0);
}

if (opt('rollback')) {
  const id = String(opt('rollback'));
  const rv = String(fs.readFileSync(path.join(root, 'app.json'), 'utf8').match(/"runtimeVersion":\s*"([^"]+)"/)?.[1] || '');
  const tmp = path.join(root, 'dist-ota-latest.json');
  gcs('cp', `gs://${BUCKET}/ota/${app}/${rv}/android/history/${id}.json`, tmp);
  gcs('cp', tmp, `gs://${BUCKET}/ota/${app}/${rv}/android/latest.json`, '--cache-control=no-cache');
  fs.unlinkSync(tmp);
  console.log(`\nRolled back: update ${id} is live again for runtime ${rv}.`);
  process.exit(0);
}

console.log(`\n[1/4] Exporting the ${app} app JavaScript bundle...`);
fs.rmSync(outDir, { recursive: true, force: true });
// OTA_MAX_WORKERS=1 keeps Metro inside the RAM of a small machine (bundling ran out of memory at 7.8 GB).
run('npx', ['expo', 'export', '--platform', 'android', '--output-dir', 'dist-ota', '--clear', ...(env.OTA_MAX_WORKERS ? ['--max-workers', String(env.OTA_MAX_WORKERS)] : [])]);

const meta = JSON.parse(fs.readFileSync(path.join(outDir, 'metadata.json'), 'utf8'));
// the export does not always write expoConfig.json - ask expo for the public config (what Constants.expoConfig reads)
const expoConfig = JSON.parse(run('npx', ['expo', 'config', '--json', '--type', 'public'], { capture: true }));
const runtimeVersion = runtimeVersionOf(expoConfig);
const updateId = crypto.randomUUID();
const base = `${PUBLIC}/ota/${app}/${runtimeVersion}/${updateId}`;

console.log('[2/4] Building the manifest...');
const norm = (p) => String(p).replace(/\\/g, '/');   // Windows exports use backslashes; URLs need forward slashes
const fileInfo = (rel) => {
  const buf = fs.readFileSync(path.join(outDir, rel));
  return { buf, hash: sha256(buf), key: md5(buf) };
};
const bundleRel = norm(meta.fileMetadata.android.bundle);
const b = fileInfo(bundleRel);
const launchAsset = { hash: b.hash, key: b.key, contentType: 'application/javascript', fileExtension: '.bundle', url: `${base}/${bundleRel}` };
const assets = (meta.fileMetadata.android.assets || []).map((a) => {
  const rel = norm(a.path);
  const f = fileInfo(rel);
  return { hash: f.hash, key: f.key, contentType: mime[a.ext] || 'application/octet-stream', fileExtension: a.ext ? `.${a.ext}` : '', url: `${base}/${rel}` };
});
const manifest = {
  id: updateId,
  createdAt: new Date().toISOString(),
  runtimeVersion,
  launchAsset,
  assets,
  metadata: { message: message === true ? '' : String(message) },
  extra: { expoClient: expoConfig },
};

console.log(`[3/4] Uploading ${assets.length + 1} files to Google Cloud Storage...`);
gcs('cp', '-r', path.join(outDir, '*'), `gs://${BUCKET}/ota/${app}/${runtimeVersion}/${updateId}/`, '--cache-control=public, max-age=31536000, immutable');

console.log('[4/4] Publishing (this is the moment phones can start receiving it)...');
const latestPath = path.join(outDir, 'latest.json');
fs.writeFileSync(latestPath, JSON.stringify(manifest));
gcs('cp', latestPath, `gs://${BUCKET}/ota/${app}/${runtimeVersion}/android/history/${updateId}.json`);
gcs('cp', latestPath, `gs://${BUCKET}/ota/${app}/${runtimeVersion}/android/latest.json`, '--cache-control=no-cache');

console.log(`\nDone. Update ${updateId} (runtime ${runtimeVersion}) is live.`);
console.log(`Phones get it next time the app opens (it is applied on the following start, or immediately if the in-app "restart" prompt is accepted).`);
console.log(`To undo: node scripts/publish-ota.js --app ${app} --rollback <previous update id>   (see --list)\n`);
