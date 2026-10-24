// Expo config plugin: the staff alert overlay ("display over other apps" bubble + an on-duty foreground service + battery-whitelist helpers).
// Ported from the Driver App's withBubbleOverlay plugin (same, proven native code), re-packaged for com.dropcars.dropcarsadmin.
// NATIVE: needs a new Admin build to take effect (an OTA cannot add it). The JS side (services/staffAlertOverlay.ts) is safe on an old build.
const {
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PKG_NAME = 'com.dropcars.dropcarsadmin';
const SUB_PKG = 'alertoverlay';

function withManifest(config) {
  return withAndroidManifest(config, (config) => {
    const { manifest } = config.modResults;
    if (!manifest['uses-permission']) manifest['uses-permission'] = [];

    [
      'android.permission.SYSTEM_ALERT_WINDOW',            // display over other apps
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', // lets us open "always allow in background"
      'android.permission.USE_FULL_SCREEN_INTENT',
      'android.permission.WAKE_LOCK',
    ].forEach((name) => {
      const exists = manifest['uses-permission'].some((item) => item.$ && item.$['android:name'] === name);
      if (!exists) manifest['uses-permission'].push({ $: { 'android:name': name } });
    });

    if (manifest.application && manifest.application.length > 0) {
      const app = manifest.application[0];
      if (!app.service) app.service = [];
      const serviceName = `.${SUB_PKG}.StaffAlertOverlayService`;
      if (!app.service.some((item) => item.$ && item.$['android:name'] === serviceName)) {
        app.service.push({
          $: {
            'android:name': serviceName,
            'android:enabled': 'true',
            'android:exported': 'false',
            'android:foregroundServiceType': 'specialUse',
          },
          property: [{ $: { 'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE', 'android:value': 'staff_alert_overlay_bubble' } }],
        });
      }
    }
    return config;
  });
}

function withMainApplicationPackage(config) {
  return withMainApplication(config, (config) => {
    let content = config.modResults.contents;
    const importStmt = `import ${PKG_NAME}.${SUB_PKG}.StaffAlertOverlayPackage`;
    const addStmt = 'add(StaffAlertOverlayPackage())';

    if (!content.includes(importStmt)) {
      content = content.replace(new RegExp(`package ${PKG_NAME.replace(/\./g, '\\.')}\\r?\\n`), `package ${PKG_NAME}\n\n${importStmt}\n`);
    }
    if (!content.includes(addStmt)) {
      if (/PackageList\(this\)\.packages\.apply \{/.test(content)) {
        // Expo SDK 53+ template:  PackageList(this).packages.apply { ... }
        content = content.replace(/PackageList\(this\)\.packages\.apply \{\r?\n/, (m) => `${m}              ${addStmt}\n`);
      } else {
        // older template:  val packages = PackageList(this).packages
        content = content.replace(/val packages = PackageList\(this\)\.packages\r?\n/, (m) => `${m}            packages.add(StaffAlertOverlayPackage())\n`);
      }
    }
    config.modResults.contents = content;
    return config;
  });
}

function withNativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const targetDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', ...PKG_NAME.split('.'), SUB_PKG);
      const sourceDir = path.join(projectRoot, 'plugins', 'native_alert_overlay');
      if (fs.existsSync(sourceDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        for (const file of fs.readdirSync(sourceDir)) {
          fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
        }
      }
      return config;
    },
  ]);
}

function withStaffAlertOverlay(config) {
  config = withManifest(config);
  config = withMainApplicationPackage(config);
  config = withNativeFiles(config);
  return config;
}

module.exports = createRunOncePlugin(withStaffAlertOverlay, 'withStaffAlertOverlay', '1.0.0');
