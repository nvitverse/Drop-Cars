# Driver App Over-The-Air (OTA) Updates Guide

## Overview
This document outlines how to publish JS/JSX Over-The-Air (OTA) updates to the **Drop Cars Driver App** using **EAS Update**. OTA updates allow instant bug fixes, UI enhancements, and business logic updates to reach installed user devices without requiring a full Android build (APK/AAB) or Play Store review cycle.

---

## ⚙️ Configuration Summary

### 1. `app.json` Configuration
```json
{
  "expo": {
    "name": "Drop Cars-Driver App",
    "slug": "dropcars3",
    "runtimeVersion": "1.0.0",
    "updates": {
      "url": "https://u.expo.dev/31f4ffee-37b4-4db6-a102-1cd99bd74f8e"
    },
    "extra": {
      "eas": {
        "projectId": "31f4ffee-37b4-4db6-a102-1cd99bd74f8e"
      }
    }
  }
}
```

### 2. Channel Mapping (`eas.json`)
- **`preview` Channel**: Linked to `preview` profile builds (internal APKs).
- **`production` Channel**: Linked to `production` profile builds (Play Store AABs).

---

## 🚀 How to Ship an OTA Update

### Ship to Preview Testing Channel:
```bash
npx eas-cli update --channel preview --message "Fix UI spacing in trip detail modal"
```

### Ship Live to Production Users:
```bash
npx eas-cli update --channel production --message "Hotfix: Update commission calculation logic"
```

---

## ⚠️ What Counts as OTA-Safe vs Native Build Required

### ✅ Safe for OTA Updates (No Play Store rebuild needed):
- Modifying React / React Native components (`.tsx`, `.js`).
- Adding or editing Expo Router screens (`app/`).
- Updating API service methods, helpers, or utilities (`services/`, `utils/`).
- Adding or replacing static assets (images, icons, fonts).

### ⛔ Requires a New Native Android Build (APK/AAB required):
- Adding or upgrading npm packages containing **native code** (`android/` or autolinked modules).
- Modifying Android Native files directly (e.g. `BubbleOverlayService.kt`, `BubbleOverlayModule.kt`, `AndroidManifest.xml`).
- Changing `app.json` fields that alter native manifest/build config (permissions, package name, versionCode).
- Changing `runtimeVersion` policy in `app.json`.

---

## 🔍 Verifying Published OTA Updates

View all published update bundles for this project:
```bash
npx eas-cli update:list
```

Roll back or re-route channel traffic:
```bash
npx eas-cli update:republish --channel production --group <group-id>
```
