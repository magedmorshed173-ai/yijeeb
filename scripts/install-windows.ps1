# ============================================================
# يجيب — تثبيت وتشغيل على ويندوز بسطر واحد (PowerShell):
#   irm https://raw.githubusercontent.com/magedmorshed173-ai/yijeeb/main/scripts/install-windows.ps1 | iex
# ============================================================
$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/magedmorshed173-ai/yijeeb.git"
$ZipUrl  = "https://github.com/magedmorshed173-ai/yijeeb/archive/refs/heads/main.zip"
$AppDir  = Join-Path $env:USERPROFILE "yijeeb"

Write-Host ""
Write-Host "  ==================================" -ForegroundColor Cyan
Write-Host "   يجيب — تثبيت على ويندوز" -ForegroundColor Cyan
Write-Host "  ==================================" -ForegroundColor Cyan
Write-Host ""

function Refresh-Path {
  $m = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $u = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$m;$u"
}

# ---------- [1/5] Node.js 22+ ----------
Write-Host "› [1/5] التحقق من Node.js…"
$nodeOk = $false
try {
  $v = (& node --version) 2>$null
  if ($v -match '^v(\d+)\.') { if ([int]$Matches[1] -ge 22) { $nodeOk = $true } }
} catch {}
if ($nodeOk) {
  Write-Host "  Node $(& node --version) OK" -ForegroundColor Green
} else {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "X أحتاج Node.js 22 — ثبّته من https://nodejs.org ثم أعد السكربت" -ForegroundColor Yellow
    exit 1
  }
  Write-Host "  سأثبّت Node.js LTS عبر winget…"
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements | Out-Null
  Refresh-Path
  $nodeOk = $false
  try { $v = (& node --version); if ($v -match '^v(\d+)\.' -and [int]$Matches[1] -ge 22) { $nodeOk = $true } } catch {}
  if (-not $nodeOk) {
    Write-Host "X اكتمل تثبيت Node لكنه غير ظاهر في هذه النافذة." -ForegroundColor Yellow
    Write-Host "  أغلق النافذة وافتح PowerShell من جديد ثم أعد السكربت." -ForegroundColor Yellow
    exit 1
  }
  Write-Host "  Node $(& node --version) OK" -ForegroundColor Green
}

# ---------- [2/5] Git (إن غاب) ----------
Write-Host "› [2/5] التحقق من Git…"
if (Get-Command git -ErrorAction SilentlyContinue) {
  Write-Host "  Git $((& git --version) -replace 'git version ','') OK" -ForegroundColor Green
} elseif (Get-Command winget -ErrorAction SilentlyContinue) {
  Write-Host "  سأثبّت Git عبر winget…"
  winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements | Out-Null
  Refresh-Path
} else {
  Write-Host "  لا Git ولا winget — سأنزّل نسخة ZIP بدل الاستنساخ." -ForegroundColor DarkCyan
}

# ---------- [3/5] تنزيل يجيب ----------
Write-Host "› [3/5] تنزيل يجيب…"
$haveGit = Get-Command git -ErrorAction SilentlyContinue
if (Test-Path (Join-Path $AppDir ".git")) {
  git -C $AppDir pull --ff-only 2>$null
  Write-Host "  محدَّث لأحدث نسخة OK" -ForegroundColor Green
} elseif ($haveGit) {
  if (Test-Path $AppDir) { Remove-Item -Recurse -Force $AppDir }
  git clone --depth 1 $RepoUrl $AppDir 2>$null
  if (-not (Test-Path $AppDir)) { Write-Host "X فشل الاستنساخ — تحقق من اتصالك بالإنترنت" -ForegroundColor Yellow; exit 1 }
  Write-Host "  نُزِّلت إلى $AppDir OK" -ForegroundColor Green
} else {
  $zip = Join-Path $env:TEMP "yijeeb-main.zip"
  $tmp = Join-Path $env:TEMP "yijeeb-extract"
  Invoke-WebRequest -Uri $ZipUrl -OutFile $zip -UseBasicParsing
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  if (Test-Path $AppDir) { Remove-Item -Recurse -Force $AppDir }
  Move-Item (Join-Path $tmp "yijeeb-main") $AppDir
  Remove-Item -Force $zip; Remove-Item -Recurse -Force $tmp
  Write-Host "  نُزِّلت إلى $AppDir OK" -ForegroundColor Green
}

# ---------- [4/5] الاعتماديات ----------
Write-Host "› [4/5] تجهيز الخادم (أول مرة تأخذ دقيقة)…"
Push-Location (Join-Path $AppDir "server")
try { npm install --no-audit --no-fund --loglevel=error } finally { Pop-Location }
Write-Host "  جاهز OK" -ForegroundColor Green

# ---------- [5/5] تشغيل ----------
Write-Host "› [5/5] تشغيل يجيب…"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $AppDir "scripts\start.ps1")
