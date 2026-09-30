# 🚀 Pre-Deployment Verification Guide & Checklist
## Drop Cars - Production Deployment Protocol

This document defines the **permanent pre-deployment testing system** for **Drop Cars - Website**. Follow this guide every time before deploying code updates to production (Hostinger).

---

## ⚡ Quick Start: Automated Pre-Deploy Test

To test everything automatically before uploading, run the pre-deploy launcher script from your terminal:

```powershell
# 1. Run full automated pre-deployment test suite
.\test-predeploy.ps1

# 2. Run tests AND automatically package deploy/ ONLY if 100% of tests pass
.\test-predeploy.ps1 -Sync

# 3. Direct PHP execution alternative:
php scripts/pre-deploy-test.php --auto-start-server
```

---

## 🔍 Automated Test Suites Executed

The automated test suite (`scripts/pre-deploy-test.php`) runs 9 comprehensive test suites:

### 1. PHP Syntax & Lint Audit (`php -l`)
- Scans all `.php` files across `pages/`, `api/`, `admin/`, `config/`, `includes/`, `core/`, `engine/`, `helpers/`, `components/`.
- **Purpose**: Prevents parse errors or syntax mistakes from reaching production.

### 2. UTF-8 BOM & Encoding Audit
- Scans `.htaccess`, `router.php`, `config/*.php`, `api/*.php`, `index.php`.
- **Purpose**: Detects hidden Byte Order Marks (`0xEF 0xBB 0xBF`) that cause Apache 500 server errors or leak output into PHP header redirects.

### 3. Database Connection & Schema Health Test
- Connects using `config/db.php` / `config/db.local.php`.
- Verifies connection and query execution on `bookings`, `settings`, `admins`, `routes`, `vehicles`, `reviews`, `coupons`.
- Confirms default timezone is set to `Asia/Kolkata`.

### 4. API Keys & External Integrations Handshake
- Validates `GOOGLE_MAPS_API_KEY` configuration and executes live Geocoding API test (`/api/geocode.php`).
- Verifies `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and mailer settings.

### 5. Page Loadings & Dynamic URL HTTP Audits
- Tests HTTP status codes (200 OK / 301 Redirect) and scans HTML response bodies for PHP warnings, notices, fatal errors, or 500 errors across:
  - **Core Pages**: `/`, `/airport-transfer`, `/one-way-cab`, `/round-trip-cab`, `/outstation-cab`, `/about-us`, `/contact`, `/privacy`, `/terms`, `/track-booking`, `/customer-login`.
  - **Admin Pages**: `/admin/login`, `/admin/dashboard`.
  - **Dynamic Route Landing Pages**: `/chennai-to-bangalore-taxi`, `/taxi-service-in-chennai`.

### 6. API Endpoint Functional Audits
- Queries live API endpoints (`/api/geocode.php`, `/api/get-site-settings.php`, `/api/reviews.php`) and asserts valid JSON structures.

### 7. Live Fare Calculation Simulation (Dry-Run Test)
- Simulates a ride fare calculation through the pricing engine (`engine/fare_calculator.php` / `api/route-distance.php`) to ensure distance, base fare, per-km rate, and totals compute valid numeric amounts.

### 8. Pop-Up Modals & Frontend Asset Verification
- Verifies essential JavaScript assets (`location-picker.js`, `booking.js`, `style.css`) exist on disk.
- Confirms location-picker popup modal (`#locationModal`) exists in the rendered HTML DOM.

### 9. Deploy Package Sync & Safety Audit
- Compares file timestamps between root workspace and `public_html/` to prevent overwriting newer edits during `sync-deploy.ps1`.

---

## 📋 Manual Pre-Deployment Checklist

In addition to automated tests, perform these manual checks before pushing live:

| Category | Checklist Item | Status |
| :--- | :--- | :---: |
| **Mobile Layout** | Test homepage and booking form on iPhone and Android mobile screen sizes. | [ ] |
| **Booking Flow** | Submit a test booking on `/airport-transfer` and verify confirmation screen load. | [ ] |
| **Notifications** | Confirm Telegram notification alert or email is received for test booking. | [ ] |
| **Admin Panel** | Log in to `/admin/login` and verify recent bookings list loads cleanly. | [ ] |
| **SSL & HTTPS** | Verify all static assets (images, CSS, JS) load over `https://` without mixed content warnings. | [ ] |

---

## 🛠️ Troubleshooting & Fixes

### Issue: "BOM Detected in .htaccess or router.php"
- **Cause**: Windows text editor saved file with UTF-8 BOM.
- **Fix**: Run `.\sync-deploy.ps1` (it strips BOM automatically) or save the file in your code editor with `UTF-8` (without BOM).

### Issue: "Google Maps Geocoding Live Handshake Failed"
- **Cause**: Missing, invalid, or billing-restricted Google Maps API Key in `config/env.php`.
- **Fix**: Check `config/env.php` and verify `GOOGLE_MAPS_API_KEY` is set and Google Maps Geocoding & Places APIs are enabled in your Google Cloud Console.

### Issue: "Files in public_html/ are NEWER than project root"
- **Cause**: Changes were made inside `public_html/` directly instead of the project root source of truth.
- **Fix**: Copy modified files from `public_html/` back to project root, or run `.\sync-deploy.ps1 -Force` if root files are up-to-date.

---

## 🔒 Deployment Workflow Summary

1. **Develop locally**: Make code changes in project root folders (`pages/`, `api/`, `admin/`, etc.).
2. **Run Pre-Deploy Verification**:
   ```powershell
   .\test-predeploy.ps1 -Sync
   ```
3. **Upload to Hostinger**:
   - Upload contents of `deploy/public_html/*` ➔ Hostinger web root (`public_html/`).
   - Upload `deploy/database.local.php` / `deploy/secret.php` (if changed) ➔ Hostinger account root next to `public_html/`.
