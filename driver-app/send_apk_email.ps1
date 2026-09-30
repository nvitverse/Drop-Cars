param(
    [string]$ApkPath = "C:\Users\Administrator\Desktop\DropCarsDriver-latest.apk",
    [string]$Recipient = "dropcarsbookings@gmail.com"
)

$smtp = New-Object System.Net.Mail.SmtpClient("smtp.gmail.com", 587)
$smtp.EnableSsl = $true
$smtp.Credentials = New-Object System.Net.NetworkCredential("dropcars.in@gmail.com", "zmeawkukgffgvlxo")

$msg = New-Object System.Net.Mail.MailMessage
$msg.From = New-Object System.Net.Mail.MailAddress("dropcars.in@gmail.com", "Drop Cars Automated Build System")
$msg.To.Add($Recipient)
$msg.Subject = "🚀 Drop Cars Driver App v1.0.7 - New APK Build Ready"
$msg.IsBodyHtml = $true

$downloadUrl = "https://dropcars.in/downloads/DropCarsDriver-latest.apk"
$apkSizeMB = "55.82"
if (Test-Path $ApkPath) {
    $apkSizeMB = [math]::Round(((Get-Item $ApkPath).Length / 1MB), 2)
}

$bodyHtml = @"
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #0f172a; }
    .card { background: #ffffff; border-radius: 16px; max-width: 620px; margin: 0 auto; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; padding: 28px 24px; text-align: center; }
    .badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 8px; }
    .title { margin: 0; font-size: 22px; font-weight: 800; }
    .content { padding: 24px; }
    .btn-wrap { text-align: center; margin: 24px 0; }
    .dl-btn { display: inline-block; background: #0284c7; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 30px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 12px rgba(2,132,199,0.35); }
    .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px; margin-bottom: 18px; }
    .box-title { font-size: 14px; font-weight: 700; color: #0284c7; margin-top: 0; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
    ul { margin: 0; padding-left: 20px; font-size: 13.5px; line-height: 1.6; }
    li { margin-bottom: 6px; }
    .file-meta { font-size: 12px; color: #64748b; background: #e2e8f0; padding: 8px 14px; border-radius: 8px; font-family: Consolas, monospace; word-break: break-all; margin-top: 14px; }
    .footer { font-size: 12px; color: #94a3b8; text-align: center; padding: 16px; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="badge">BUILD COMPLETE &amp; VERIFIED</div>
      <h1 class="title">Drop Cars Driver App v1.0.7</h1>
      <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 13px;">Automated Standalone APK Release</p>
    </div>

    <div class="content">
      <p>Vanakkam team,</p>
      <p>The latest build of the <strong>Drop Cars Driver &amp; Partner App</strong> has been compiled successfully with all recent enhancements.</p>

      <div class="btn-wrap">
        <a href="$downloadUrl" class="dl-btn" target="_blank">⬇️ Download Driver App APK ($apkSizeMB MB)</a>
      </div>

      <div class="box">
        <div class="box-title">🚀 Key Updates Included in This Release:</div>
        <ul>
          <li><strong>Deep LLM Intelligence</strong>: 40+ South Indian cities distance matrix, Start/End OTP rules, Fastag tolls, waiting time policies, and cancellation guidelines.</li>
          <li><strong>24/7 DropBot AI Messenger</strong>: Interactive in-app chat assistant with quick suggestion chips, live bubbles, and dispatch desk escalation.</li>
          <li><strong>Clean (i) Info Modals</strong>: Dedicated modal explaining the ₹500 security hold, instant release upon End OTP, and 10s free decline without cluttering the UI.</li>
          <li><strong>Assignment Rules &amp; Deadlines</strong>: Popup guidelines for assignment window countdown, auto-revocation, and ₹0 penalty rules.</li>
          <li><strong>Date Range Calendar Filter</strong>: Interactive calendar date picker integrated into Future Rides for easy booking filtering.</li>
        </ul>
      </div>

      <div class="file-meta">
        <strong>Direct Download:</strong> <a href="$downloadUrl" style="color:#0284c7;">$downloadUrl</a><br>
        <strong>Local Path:</strong> $ApkPath<br>
        <strong>Package:</strong> com.dropcars.driverapp (versionCode 16, versionName 1.0.7)
      </div>
    </div>

    <div class="footer">
      Drop Cars Automated Build System • Delivered via Gmail SMTP to $Recipient • $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') IST
    </div>
  </div>
</body>
</html>
"@

$msg.Body = $bodyHtml

# If APK is less than 25MB, attach it directly
if (Test-Path $ApkPath) {
    $sizeBytes = (Get-Item $ApkPath).Length
    if ($sizeBytes -lt (25 * 1024 * 1024)) {
        Write-Host "Attaching APK directly ($([math]::Round($sizeBytes/1MB, 2)) MB)..."
        $attachment = New-Object System.Net.Mail.Attachment($ApkPath)
        $msg.Attachments.Add($attachment)
    } else {
        Write-Host "Notice: APK size is $([math]::Round($sizeBytes/1MB, 2)) MB (exceeds Gmail 25MB direct attachment limit). Providing 1-click download link in email."
    }
}

try {
    Write-Host "Sending release email via SMTP to $Recipient..."
    $smtp.Send($msg)
    Write-Host "SUCCESS: Build notification and 1-click APK download link delivered to $Recipient!" -ForegroundColor Green
} catch {
    Write-Error "SMTP Send Failed: $_"
} finally {
    if ($attachment) { $attachment.Dispose() }
    $msg.Dispose()
    $smtp.Dispose()
}
