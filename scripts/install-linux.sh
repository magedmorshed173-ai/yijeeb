#!/usr/bin/env bash
# ============================================================
# يجيب — تثبيت وتشغيل على لينكس بسطر واحد:
#   curl -fsSL https://raw.githubusercontent.com/magedmorshed173-ai/yijeeb/main/scripts/install-linux.sh | bash
# ============================================================
set -e

REPO_URL="https://github.com/magedmorshed173-ai/yijeeb.git"
APP_DIR="$HOME/yijeeb"

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi

echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║   يجيب — تثبيت على لينكس          ║"
echo "  ╚══════════════════════════════════╝"
echo ""

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] 2>/dev/null
}

# 1) Node.js 22+
echo "› [1/4] التحقق من Node.js…"
if node_ok; then
  echo "  Node $(node --version) ✓"
else
  echo "  سأثبّت Node.js 22…"
  if command -v apt-get >/dev/null 2>&1; then
    command -v curl >/dev/null 2>&1 || $SUDO apt-get update -qq && $SUDO apt-get install -y -qq curl ca-certificates
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash -
    $SUDO apt-get install -y -qq nodejs
  elif command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | $SUDO bash -
    $SUDO dnf install -y -q nodejs
  elif command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | $SUDO bash -
    $SUDO yum install -y -q nodejs
  elif command -v pacman >/dev/null 2>&1; then
    $SUDO pacman -Sy --noconfirm --needed nodejs npm
  elif command -v apk >/dev/null 2>&1; then
    $SUDO apk add --no-cache nodejs npm
  elif command -v zypper >/dev/null 2>&1; then
    $SUDO zypper install -y nodejs22 || $SUDO zypper install -y nodejs
  else
    echo "✗ لم أتعرف على مدير حزم توزيعتك — ثبّت Node.js 22 يدويًا من https://nodejs.org ثم أعد السكربت" && exit 1
  fi
  node_ok || { echo "✗ لم يكتمل تثبيت Node 22 — ثبّته يدويًا من https://nodejs.org" && exit 1; }
  echo "  Node $(node --version) ✓"
fi

# 2) Git (إن غاب)
command -v git >/dev/null 2>&1 || {
  echo "› تثبيت Git…"
  if command -v apt-get >/dev/null 2>&1; then $SUDO apt-get install -y -qq git
  elif command -v dnf >/dev/null 2>&1; then $SUDO dnf install -y -q git
  elif command -v yum >/dev/null 2>&1; then $SUDO yum install -y -q git
  elif command -v pacman >/dev/null 2>&1; then $SUDO pacman -Sy --noconfirm --needed git
  elif command -v apk >/dev/null 2>&1; then $SUDO apk add --no-cache git
  elif command -v zypper >/dev/null 2>&1; then $SUDO zypper install -y git
  fi
}

# 3) تنزيل أو تحديث يجيب
echo "› [2/4] تنزيل يجيب…"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only 2>/dev/null && echo "  محدَّث لأحدث نسخة ✓" || echo "  (بقيت النسخة الحالية)"
else
  [ -d "$APP_DIR" ] && rm -rf "$APP_DIR"
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
  echo "  نُزِّلت إلى $APP_DIR ✓"
fi

# 4) الاعتماديات + تشغيل
echo "› [3/4] تجهيز الخادم…"
cd "$APP_DIR/server"
npm install --no-audit --no-fund --loglevel=error
echo "  جاهز ✓"

echo "› [4/4] تشغيل يجيب…"
cd "$APP_DIR"
exec bash scripts/start.sh
