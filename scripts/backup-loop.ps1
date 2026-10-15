# Runs scripts\backup-to-github.ps1 now and then every hour, forever (started at Windows sign-in by the Startup folder item "DropCars-GitHub-Backup").
Set-Location C:\gtmp\wt-merged
while ($true) {
  try { & "C:\gtmp\wt-merged\scripts\backup-to-github.ps1" } catch { "$((Get-Date).ToString('yyyy-MM-dd HH:mm')) backup failed: $_" | Out-File -Append -Encoding utf8 "C:\gtmp\backup-to-github.log" }
  Start-Sleep -Seconds 3600
}

