# Drop Cars — Official Trademark Registered Brand & Logo Kit Guide

> **Trademark Registration Design Standard**  
> All logos, app icons, favicons, invoices, and digital assets across Drop Cars properties must strictly adhere to the registered trademark geometry and color specifications detailed below.

---

## 1. Master Brand Assets Location

The official Brand Kit is permanently stored and synchronized across all ecosystem projects:

- **Website Master**: `public_html/assets/brand/`
- **Customer App**: `Drop Cars Customer App/assets/brand/` & `assets/images/`
- **Vendor App**: `Vendor App/assets/brand/` & `assets/images/`
- **Admin App**: `admin/assets/brand/` & `assets/images/`
- **Backend**: `backend/app/assets/brand/`
- **Full Repo Mirror**: `Drop-Cars-Full-Repo/.../assets/brand/`

---

## 2. Core Brand Geometry & Colors

| Property | Value | Notes |
| :--- | :--- | :--- |
| **Primary Brand Color** | `#0D47A1` | Deep Royal Navy Blue (Trademark registered) |
| **Secondary Color** | `#FFFFFF` | Pure White |
| **Accent / Contrast Border** | `#3B82F6` | Used for dark background contrast |
| **Typography** | `Poppins` (Bold / 700) | Secondary fallback: `Plus Jakarta Sans`, sans-serif |
| **Emblem Mark** | Squircle (`rx="42"` on 200x200) | Two rounded opposing chevrons (`stroke-width="14"`) |
| **Pill Badge Ratio** | `380 x 110` (`rx="22"`) | Split pill: Left `#0D47A1` ("DROP") \| Right `#FFFFFF` ("CARS") |

---

## 3. Logo Variations & Usage Matrix

| Variant File | Recommended Use Case | Specifications |
| :--- | :--- | :--- |
| **`DropCars_Logo_Combo_color.svg`** | Primary Splash, Cover photos, Marketing Banners, Document covers | Vertical stacked lockup (Icon + Pill Badge) |
| **`DropCars_Logo_Horizontal_Color.svg`** | Website Navbar, Invoices, Estimations, Web Headers | 520x110 Horizontal Lockup (Icon Left + Pill Right + ®) |
| **`DropCars_Logo_Horizontal_DarkTheme.svg`** | Dark mode headers, Transparent sticky navbars | Crisp high-contrast outline for dark backgrounds |
| **`DropCars_Icon_AppStyle_1024.png`** | Mobile App Icon (Customer, Vendor, Admin), Google Play & App Store | 1024x1024 High-Res Squircle Emblem |
| **`DropCars_Icon_CircleSafe_*.png`** | Android Circular Adaptive Icons, Favicons, Web avatars | Safe margin within circle crop bounds |
| **`DropCars_Logo_Vendor_Partner.svg`** | Vendor App splash & headers, Partner registration portal | Trademark mark + Amber/Gold `VENDOR PARTNER` badge |
| **`DropCars_Logo_Admin_Console.svg`** | Admin Console dashboard header & auth screens | Trademark mark + Indigo `ADMIN CONSOLE` badge |
| **`DropCars_Logo_Invoice_Header.svg`** | Official GST Tax Invoices (SAC 9964) & Ride Fare Estimations | High-precision vector lockup tailored for A4 print & PDF |
| **`favicon.ico`** | Web browsers, root favicon | Multi-resolution 16/32/48 ICO |

---

## 4. Ecosystem Integration Status

1. **Website (`Drop Cars - Website`)**:
   - `favicon.ico`, `favicon-32x32.png`, `favicon-192x192.png`, `apple-touch-icon.png` updated to trademark assets.
   - `dropcars-emblem.png` and `logo-icon.png` updated to trademark AppStyle squircle.
   - `navbar.css` & `dark-mode.css` updated to official `#0D47A1` royal navy blue and `Poppins` bold typography.
   - `invoice-gst.php` updated with official `DropCars_Logo_Invoice_Header.svg` and registered trademark designation.

2. **Customer App (`Drop Cars Customer App`)**:
   - `assets/images/icon.png` updated to `DropCars_Icon_AppStyle_1024.png`.
   - `assets/images/favicon.png` updated to `DropCars_Icon_CircleSafe_192.png`.
   - `app.json` updated with `#0D47A1` adaptive icon background and notification brand color.

3. **Vendor App (`Vendor App`)**:
   - `assets/images/icon.png` & `favicon.png` updated with official trademark assets.
   - `app.json` updated with `#0D47A1` adaptive icon background.
   - Custom `DropCars_Logo_Vendor_Partner.svg` and `DropCars_Icon_Vendor_Partner.svg` ready for partner portals.

4. **Admin Console (`admin`)**:
   - `assets/images/icon.png` & `favicon.png` updated with official trademark assets.
   - `app.json` configured with `#0D47A1` adaptive icon.
   - Custom `DropCars_Logo_Admin_Console.svg` ready for console headers.

5. **Driver App (`Driver-App`)**:
   - Kept unchanged as instructed.
