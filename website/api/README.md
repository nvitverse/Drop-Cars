# Drop Cars – Enquiry API

Sends email and Telegram notifications when a booking enquiry is submitted.

## Setup

### 1. Email (Gmail)

1. Copy `config.example.php` to `config.php`
2. Enable 2-Step Verification on your Gmail account
3. Create an App Password at https://myaccount.google.com/apppasswords
4. Add the 16-character password to `config.php` → `gmailAppPassword`

### 2. Telegram (optional)

1. Create a bot via [@BotFather](https://t.me/BotFather), get the token
2. Add token to `config.php` → `telegramBotToken`
3. Get your chat ID (e.g. send a message to your bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates`)
4. Add chat ID(s) to `config.php` → `telegramChatIds` (array)

### 3. PHPMailer

If not using Composer, download PHPMailer and place in `api/phpmailer/src/`:
- Exception.php
- PHPMailer.php
- SMTP.php

From: https://github.com/PHPMailer/PHPMailer

### 4. Google Sheets sync (optional)

1. Create a Google Apps Script web app (or any webhook) that accepts JSON and writes rows to your target sheet
2. Set `googleSheetsWebhookUrl` in `config.php`
3. (Optional) Set `googleSheetsWebhookToken` for header auth (`X-Webhook-Token`)

## Environment variables (optional)

- `GMAIL_APP_PASSWORD` – overrides config
- `TELEGRAM_BOT_TOKEN` – overrides config
- `TELEGRAM_CHAT_ID` – single chat (comma-separated for multiple)
- `GOOGLE_SHEETS_WEBHOOK_URL` – overrides config webhook URL
- `GOOGLE_SHEETS_WEBHOOK_TOKEN` – overrides config webhook token

## Security

- Never commit `config.php` to version control
- Ensure `config.php` is in `.gitignore`
