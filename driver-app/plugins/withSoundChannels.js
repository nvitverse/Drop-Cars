// Config plugin: native "SoundChannels" module (admin-uploaded MP3 as the
// sound of a notification channel, so it plays even when the app is closed).
// Same file in every Drop Cars app - the Kotlin package comes from
// android.package in app.json. See plugins/native_sound_channels/.
const {
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PROVIDER_PATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<paths>
  <files-path name="notification_sounds" path="notification_sounds/" />
</paths>
`;

function withSoundChannelsManifest(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application && config.modResults.manifest.application[0];
    if (!app) return config;
    app.provider = app.provider || [];
    const authority = `${config.android.package}.soundchannels`;
    if (!app.provider.some((p) => p.$ && p.$['android:authorities'] === authority)) {
      app.provider.push({
        $: {
          'android:name': 'androidx.core.content.FileProvider',
          'android:authorities': authority,
          'android:exported': 'false',
          'android:grantUriPermissions': 'true',
        },
        'meta-data': [
          { $: { 'android:name': 'android.support.FILE_PROVIDER_PATHS', 'android:resource': '@xml/sound_channel_paths' } },
        ],
      });
    }
    return config;
  });
}

function withSoundChannelsMainApplication(config) {
  return withMainApplication(config, (config) => {
    const pkg = config.android.package;
    let content = config.modResults.contents;
    const importStmt = `import ${pkg}.soundchannels.SoundChannelsPackage`;
    if (!content.includes(importStmt)) {
      content = content.replace(/^(package [\w.]+\r?\n)/m, `$1\n${importStmt}\n`);
    }
    if (!content.includes('SoundChannelsPackage()')) {
      if (/val packages = PackageList\(this\)\.packages\r?\n/.test(content)) {
        // SDK 53 template
        content = content.replace(
          /(val packages = PackageList\(this\)\.packages\r?\n)/,
          `$1            packages.add(SoundChannelsPackage())\n`
        );
      } else {
        // SDK 54 template: PackageList(this).packages.apply { ... }
        content = content.replace(
          /(PackageList\(this\)\.packages\.apply \{\r?\n)/,
          `$1              add(SoundChannelsPackage())\n`
        );
      }
    }
    if (!content.includes('SoundChannelsPackage()')) {
      throw new Error('withSoundChannels: could not register SoundChannelsPackage in MainApplication');
    }
    config.modResults.contents = content;
    return config;
  });
}

function withSoundChannelsNativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const root = config.modRequest.projectRoot;
      const pkg = config.android.package;
      const javaDir = path.join(root, 'android', 'app', 'src', 'main', 'java', ...pkg.split('.'), 'soundchannels');
      const srcDir = path.join(root, 'plugins', 'native_sound_channels');
      fs.mkdirSync(javaDir, { recursive: true });
      for (const file of fs.readdirSync(srcDir)) {
        if (!file.endsWith('.kt.tpl')) continue;
        const text = fs.readFileSync(path.join(srcDir, file), 'utf8').replace(/__PACKAGE__/g, pkg);
        fs.writeFileSync(path.join(javaDir, file.replace(/\.tpl$/, '')), text);
      }
      const xmlDir = path.join(root, 'android', 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, 'sound_channel_paths.xml'), PROVIDER_PATHS_XML);
      return config;
    },
  ]);
}

module.exports = createRunOncePlugin(
  (config) => withSoundChannelsNativeFiles(withSoundChannelsMainApplication(withSoundChannelsManifest(config))),
  'withSoundChannels',
  '1.0.0'
);
