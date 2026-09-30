<?php
/**
 * Admin panel configuration
 */

return [
    'siteName' => 'Drop Cars Admin',
    'perPage' => 25,
    'googleSheetsFakeWebhook' => getenv('GOOGLE_SHEETS_FAKE_WEBHOOK') ?: '',
    'sessionName' => 'dropcars_admin_session',
];
