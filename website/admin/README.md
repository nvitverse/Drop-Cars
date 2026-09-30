# Drop Cars Admin Panel

Minimal, responsive admin panel for taxi booking enquiries. PHP + MySQL, no frameworks.

## Setup (Hostinger)

### 1. Database

1. Create a MySQL database in Hostinger (e.g. `dropcars_admin`)
2. Import `sql/schema.sql` via phpMyAdmin
3. Run `sql/migration-reviews.sql` to add the reviews table (optional; it auto-creates on first use)
4. Run `php install.php` (CLI) or visit `install.php` once to create default admin

### 2. Configuration

Create `config/database.local.php`:

```php
<?php
return [
    'host' => 'localhost',
    'name' => 'your_db_name',
    'user' => 'your_db_user',
    'pass' => 'your_db_password',
];
```

Or set env vars: `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`

### 3. Default Login

- **Email:** admin@dropcars.in
- **Password:** DropCars@2025

Change password after first login (update `admins` table with `password_hash()`).

### 4. Sync Enquiries from Booking Form

In `api/config.php` add:

```php
'adminEnquiryApi' => '/admin/api/receive-enquiry.php',
```

New enquiries will be inserted into MySQL automatically.

### 5. Google Sheets (Fake Enquiries)

Set `GOOGLE_SHEETS_FAKE_WEBHOOK` or add to `admin/config/config.php`:

```php
'googleSheetsFakeWebhook' => 'https://script.google.com/...',
```

When an enquiry is marked **Fake**, IP, name, phone, date are sent to your Apps Script webhook.

### 6. IP Blocking

Include in `api/send-enquiry.php` and `api/confirm_booking.php` (before processing):

```php
require_once __DIR__ . '/../admin/includes/check-blocked.php';
dropcars_check_blocked_ip();
```

Blocked IPs cannot submit enquiries.

## Structure

```
admin/
├── config/         Database, config
├── includes/       Auth, header, footer, check-blocked
├── actions/        login, logout, update-status
├── api/            receive-enquiry (webhook)
├── pages/          error
├── assets/         CSS, JS
├── sql/            schema.sql
├── index.php       Login
├── dashboard.php
├── enquiries.php
├── blocked-ips.php
├── reviews.php      Customer reviews (edit/remove)
└── install.php
```

## Security

- PDO prepared statements (SQL injection protection)
- `htmlspecialchars()` on all outputs (XSS protection)
- Session-based auth
- CSRF recommended for production (add token to forms)
