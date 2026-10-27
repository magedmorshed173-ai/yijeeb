# ============================================================
# يجيب — مُشغّل الخادم على ويندوز
# الاستخدام:  powershell -ExecutionPolicy Bypass -File scripts\start.ps1
# أو انقر مرتين على scripts\start-yijeeb.bat
# ============================================================
$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot   # scripts\ → جذر المستودع
$data = Join-Path $repo "data"
New-Item -ItemType Directory -Force -Path $data | Out-Null

# JWT_SECRET: يُولَّد مرة واحدة ويُحفظ حتى لا يُسجَّل المستخدمون خروجًا
$secretFile = Join-Path $data ".jwt_secret"
if (-not $env:JWT_SECRET) {
  if (Test-Path $secretFile) {
    $env:JWT_SECRET = (Get-Content $secretFile -Raw).Trim()
  } else {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $env:JWT_SECRET = (($bytes | ForEach-Object { $_.ToString("x2") }) -join "")
    Set-Content -Path $secretFile -Value $env:JWT_SECRET -NoNewline -Encoding Ascii
    Write-Host "› وُلِّد سر جلسة جديد وحُفظ في: $secretFile" -ForegroundColor DarkCyan
  }
}

$env:DATA_DIR = $data
Set-Location (Join-Path $repo "server")

$port = if ($env:PORT) { $env:PORT } else { "3000" }

# فتح المتصفح تلقائيًا بعد 3 ثوانٍ
Start-Job -ScriptBlock { param($p) Start-Sleep 3; Start-Process "http://localhost:$p" } -ArgumentList $port | Out-Null

Write-Host ""
Write-Host "  ================================" -ForegroundColor Cyan
Write-Host "   يجيب يشتغل الآن" -ForegroundColor Cyan
Write-Host "  ================================" -ForegroundColor Cyan
Write-Host "   على هذا الجهاز : http://localhost:$port"
Write-Host "   للإيقاف        : Ctrl+C"
Write-Host "   لإعادة التشغيل : انقر مرتين على scripts\start-yijeeb.bat"
Write-Host "  ================================" -ForegroundColor Cyan
Write-Host ""

node server.js
