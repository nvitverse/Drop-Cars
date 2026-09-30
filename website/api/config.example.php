<?php
/**
 * Drop Cars – Enquiry notification config
 * Copy to config.php and add your credentials.
 * DO NOT commit config.php to version control.
 *
 * Same Gmail App Password is used for: enquiry emails, booking confirmation, admin forgot-password.
 */

return [
    // Email (Gmail SMTP)
    'mailFrom'       => 'support@dropcars.in',
    'mailTo'         => 'admin@dropcars.in',
    'mailFromName'   => 'Drop Cars',
    // SMTP login = Google account that owns the App Password (often @gmail.com)
    'smtpUsername'   => '',
    'gmailAppPassword' => '', // Create at https://myaccount.google.com/apppasswords
    // Used only if env + above are empty (legacy-style bootstrap)
    'fallbackSmtpUser' => '',
    'fallbackAppPassword' => '',

    // Telegram (optional)
    'telegramBotToken' => '', // From @BotFather
    'telegramChatIds'  => [], // e.g. ['123456789', '987654321']

    // Google Sheets sync (optional - Apps Script webhook for booking + enquiry tracking)
    // See docs/GOOGLE_SHEETS_WEBHOOK_SETUP.md for setup
    'googleSheetsWebhookUrl' => '',
    'googleSheetsWebhookToken' => '',
    // Optional: browser URL of the Google Sheet (to show “Open sheet” after sync)
    'googleSheetsSheetUrl' => '',

    // Google Calendar — Apps Script web app URL (POST JSON; no OAuth). See calendar-sync.php.
    'googleCalendarWebhookUrl' => '',
    'googleCalendarWebhookToken' => '',

    // Admin panel - sync enquiries to MySQL (optional)
    'adminEnquiryApi' => '/admin/api/receive-enquiry.php',

    // FastAPI backend bridge (posts confirmed bookings into the driver/vendor
    // app marketplace, pending admin approval). See api/includes/backend-client.php.
    // Base URL has no trailing slash, e.g. https://drop-cars-api-xxxx.asia-south2.run.app
    'dropcarsApiBaseUrl' => '',
    // Must match WEBSITE_INTEGRATION_KEY on the backend. Generate a long random string.
    'dropcarsApiWebsiteKey' => '',

    // Customer Notification Matrix Defaults
    'notify_customer_email_enquiry' => true,
    'notify_customer_email_pending' => true,
    'notify_customer_email_confirmed' => true,
    'notify_customer_email_driver_assigned' => true,
    'notify_customer_email_completed' => true,
    'notify_customer_email_cancelled' => true,
    'notify_customer_sms_enquiry' => false,
    'notify_customer_sms_pending' => false,
    'notify_customer_sms_confirmed' => false,
    'notify_customer_sms_driver_assigned' => false,
    'notify_customer_sms_completed' => false,
    'notify_customer_sms_cancelled' => false,
    'notify_customer_whatsapp_enquiry' => false,
    'notify_customer_whatsapp_pending' => false,
    'notify_customer_whatsapp_confirmed' => false,
    'notify_customer_whatsapp_driver_assigned' => false,
    'notify_customer_whatsapp_completed' => false,
    'notify_customer_whatsapp_cancelled' => false,
    'referralRewardAmount' => 100.00,
];
