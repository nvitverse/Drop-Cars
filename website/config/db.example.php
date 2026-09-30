<?php
/**
 * Local dev: optional copy to db.local.php (this file takes priority).
 * If db.local.php is missing, config/db.php also loads admin/config/database.local.php when on localhost.
 * On Hostinger, use database.local.php next to public_html (see admin/config/database.example.php).
 * db.local.php is gitignored — never commit credentials.
 */
return [
    'host' => 'localhost',
    'name' => 'u123456789_dropcars',
    'user' => 'u123456789_dropcars',
    'pass' => 'your_secure_password',
];
