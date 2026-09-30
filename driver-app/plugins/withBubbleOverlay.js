const {
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PKG_NAME = 'com.dropcars.driverapp';

function withBubbleOverlayManifest(config) {
  return withAndroidManifest(config, (config) => {
    const mainManifest = config.modResults;
    const { manifest } = mainManifest;

    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    const requiredPermissions = [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
    ];

    requiredPermissions.forEach((permName) => {
      const exists = manifest['uses-permission'].some(
        (item) => item.$ && item.$['android:name'] === permName
      );
      if (!exists) {
        manifest['uses-permission'].push({
          $: { 'android:name': permName },
        });
      }
    });

    // Ensure service is declared in <application>
    if (manifest.application && manifest.application.length > 0) {
      const app = manifest.application[0];
      if (!app.service) {
        app.service = [];
      }
      const serviceName = '.bubble.BubbleOverlayService';
      const exists = app.service.some(
        (item) => item.$ && item.$['android:name'] === serviceName
      );
      if (!exists) {
        app.service.push({
          $: {
            'android:name': serviceName,
            'android:enabled': 'true',
            'android:exported': 'false',
            'android:foregroundServiceType': 'specialUse',
          },
          property: [
            {
              $: {
                'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
                'android:value': 'new_booking_overlay_bubble',
              },
            },
          ],
        });
      }
    }

    return config;
  });
}

function withBubbleOverlayMainApplication(config) {
  return withMainApplication(config, (config) => {
    let content = config.modResults.contents;
    const importStmt = 'import com.dropcars.driverapp.bubble.BubbleOverlayPackage';
    const packageAdd = 'packages.add(BubbleOverlayPackage())';

    if (!content.includes(importStmt)) {
      content = content.replace(
        /package com\.dropcars\.driverapp\r?\n/,
        `package com.dropcars.driverapp\n\n${importStmt}\n`
      );
    }

    if (!content.includes(packageAdd)) {
      content = content.replace(
        /val packages = PackageList\(this\)\.packages\r?\n/,
        `val packages = PackageList(this).packages\n            ${packageAdd}\n`
      );
    }

    config.modResults.contents = content;
    return config;
  });
}

function withBubbleOverlayNativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const targetDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'dropcars',
        'driverapp',
        'bubble'
      );

      const sourceDir = path.join(projectRoot, 'plugins', 'native_bubble');

      if (fs.existsSync(sourceDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        const files = fs.readdirSync(sourceDir);
        for (const file of files) {
          const srcFile = path.join(sourceDir, file);
          const destFile = path.join(targetDir, file);
          fs.copyFileSync(srcFile, destFile);
        }
      }

      return config;
    },
  ]);
}

function withBubbleOverlay(config) {
  config = withBubbleOverlayManifest(config);
  config = withBubbleOverlayMainApplication(config);
  config = withBubbleOverlayNativeFiles(config);
  return config;
}

module.exports = createRunOncePlugin(
  withBubbleOverlay,
  'withBubbleOverlay',
  '1.0.0'
);
