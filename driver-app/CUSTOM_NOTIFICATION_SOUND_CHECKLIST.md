# Custom Notification Sound – Pre-build verification

Use this checklist before creating a new **development build** so the custom sound works for both **local** and **push** notifications.

---

## 1. App config (`app.json`)

- [ ] **expo-notifications** plugin has:
  - `"sounds": ["notification_tone.wav"]` — filename only (no path); file must be in project (e.g. `assets/notification_tone.wav`) so the plugin can bundle it.
  - `"defaultChannel": "dropcars-custom-sound-v2"` — so FCM uses this channel (and its custom sound) for push notifications.
- [ ] File `assets/notification_tone.wav` exists (`.wav` recommended by Expo; avoid long duration).

---

## 2. Runtime channel (`notificationService.ts`)

- [ ] **Channel ID** matches app.json defaultChannel:  
  `ANDROID_NOTIFICATION_CHANNEL_ID = 'dropcars-custom-sound-v2'`
- [ ] **Channel creation** (Android only) uses:
  - `sound: 'notification_tone.wav'` (base filename only, no path).
  - `importance: Notifications.AndroidImportance.MAX`
- [ ] **Handler** has `shouldPlaySound: true`.
- [ ] **Test notification** (e.g. Settings → “Test Notification Sound”):
  - `content.sound: 'notification_tone.wav'`
  - On Android: `trigger: { seconds: 1, channelId: ANDROID_NOTIFICATION_CHANNEL_ID }`

---

## 3. Other local notifications

- [ ] **demoNotificationService** (if used):
  - Imports channel ID from `@/services/notifications/notificationService`.
  - Uses `sound: 'notification_tone.wav'` and same `channelId` in trigger on Android.

---

## 4. Push notifications (Postman / backend)

- [ ] Payload to **Expo Push API** (`https://exp.host/--/api/v2/push/send`) includes:
  - `"sound": "notification_tone.wav"`
  - `"android": { "channelId": "dropcars-custom-sound-v2", "sound": "notification_tone.wav", "priority": "max" }`
- [ ] Backend (if you send via Expo) uses the same `sound` and `android.channelId` in the push payload.

---

## 5. Build and device

- [ ] **Development build** (e.g. `eas build -p android --profile development` or `npx expo run:android`). Custom sound is **not** available in Expo Go.
- [ ] Test on a **physical Android device** (not emulator).
- [ ] After installing the new build, test in this order:
  1. **Local:** Settings → “Test Notification Sound” → custom sound should play.
  2. **Push:** Send a test push (e.g. Postman) with `channelId` and `sound` as above → custom sound should play.

---

## 6. If push still uses default sound

- Uninstall the app from the device and install the new build again (avoids old channel cache).
- Confirm `defaultChannel` in app.json is exactly `"dropcars-custom-sound-v2"` and that you rebuilt **after** adding it.
- Confirm the push payload includes `android.channelId` and `sound` as in section 4.

---

## Summary of IDs and filenames

| Item            | Value                          |
|-----------------|---------------------------------|
| Channel ID      | `dropcars-custom-sound-v2`     |
| Sound filename  | `notification_tone.wav`         |
| Asset path      | `./assets/notification_tone.wav` |
