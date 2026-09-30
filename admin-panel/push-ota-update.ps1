param (
    [string]$Message = "App update"
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   Drop Cars Admin - Push OTA Update     " -ForegroundColor Cyan
Write-Host "   (Zero APK Build - Direct Cloud Push)   " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Set-Location "C:\Users\Administrator\Desktop\dropcars-review\admin"

Write-Host "`n1. Running TypeScript check..." -ForegroundColor Yellow
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: TypeScript compilation failed. Fix errors before pushing." -ForegroundColor Red
    exit 1
}

Write-Host "`n2. Publishing Over-The-Air (OTA) update to EAS production branch..." -ForegroundColor Green
npx eas update --branch production --message "$Message" --non-interactive

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n==========================================" -ForegroundColor Green
    Write-Host " SUCCESS: Update published directly!      " -ForegroundColor Green
    Write-Host " All installed devices will receive this  " -ForegroundColor Green
    Write-Host " update automatically on app restart.     " -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
} else {
    Write-Host "`nEAS update encountered an error. Check logs above." -ForegroundColor Red
}
