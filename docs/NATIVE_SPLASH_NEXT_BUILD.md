# Drop Cars: Native Splash & App Icons Specification (Next APK Build)

> **IMPORTANT:** Native splash screens are compiled into native APK binaries (`AndroidManifest.xml` / `res/drawable`) and cannot be updated via OTA JavaScript bundles. The following configurations are prepared for the next EAS / native APK build. Do **NOT** modify live `app.json` splash blocks during OTA release cycles.

---

## 1. Admin Console App (`admin-panel/app.json`)

### `app.json` Configuration
```json
{
  "expo": {
    "name": "Drop Cars Admin",
    "slug": "drop-cars-admin",
    "splash": {
      "image": "./assets/brand/DropCars_Icon_CircleSafe_512.png",
      "resizeMode": "contain",
      "backgroundColor": "#0F172A"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/brand/DropCars_Icon_Admin_Console.png",
        "backgroundColor": "#0F172A"
      }
    }
  }
}
```

---

## 2. Customer App (`customer-app/app.json`)

### `app.json` Configuration
```json
{
  "expo": {
    "name": "Drop Cars",
    "slug": "drop-cars-customer",
    "splash": {
      "image": "./assets/brand/DropCars_Icon_AppStyle_512.png",
      "resizeMode": "contain",
      "backgroundColor": "#0B1E4A"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/brand/DropCars_Icon_AppStyle_512.png",
        "backgroundColor": "#0B1E4A"
      }
    }
  }
}
```

---

## 3. Driver App (`driver-app/app.json`)

### `app.json` Configuration
```json
{
  "expo": {
    "name": "Drop Cars Driver",
    "slug": "drop-cars-driver",
    "splash": {
      "image": "./assets/images/loading-screen.webp",
      "resizeMode": "cover",
      "backgroundColor": "#0B1E4A"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/icon.png",
        "backgroundColor": "#0B1E4A"
      }
    }
  }
}
```

---

## 4. Vendor App (`vendor-app/app.json`)

### `app.json` Configuration
```json
{
  "expo": {
    "name": "Drop Cars Vendor",
    "slug": "drop-cars-vendor",
    "splash": {
      "image": "./assets/brand/DropCars_Icon_CircleSafe_512.png",
      "resizeMode": "contain",
      "backgroundColor": "#064E3B"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/brand/DropCars_Icon_Vendor_Partner.png",
        "backgroundColor": "#064E3B"
      }
    }
  }
}
```
