#!/usr/bin/env bash
# ============================================================
# يجيب — تثبيت وتشغيل على macOS بسطر واحد:
#   curl -fsSL https://raw.githubusercontent.com/magedmorshed173-ai/yijeeb/main/scripts/install-mac.sh | bash
# ============================================================
set -e

REPO_URL="https://github.com/magedmorshed173-ai/yijeeb.git"
APP_DIR="$HOME/yijeeb"

echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║   يجيب — تثبيت على macOS          ║"
echo "  ╚══════════════════════════════════╝"
echo ""

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] 2>/dev/null
}

# 1) Node.js 22+ (عبر Homebrew إن لزم)
echo "› [1/4] التحقق من Node.js…"
if node_ok; then
  echo "  Node $(node --version) ✓"
else
  command -v brew >/dev/null 2>&1 || {
    echo "✗ أحتاج Homebrew لتثبيت Node.js."
    echo "  ثبّته أولًا بهذا الأمر ثم أعد السكربت:"
    echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    exit 1
  }
  echo "  سأثبّت Node.js عبر Homebrew…"
  brew install -q node
  node_ok || { echo "✗ لم يكتمل تثبيت Node — جرّب: brew install node@22" && exit 1; }
  echo "  Node $(node --version) ✓"
fi

# 2) تنزيل أو تحديث يجيب
echo "› [2/4] تنزيل يجيب…"
command -v git >/dev/null 2>&1 || { echo "✗ ثبّت Git أولًا: brew install git" && exit 1; }
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only 2>/dev/null && echo "  محدَّث لأحدث نسخة ✓" || echo "  (بقيت النسخة الحالية)"
else
  [ -d "$APP_DIR" ] && rm -rf "$APP_DIR"
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
  echo "  نُزِّلت إلى $APP_DIR ✓"
fi

# 3) الاعتماديات
echo "› [3/4] تجهيز الخادم…"
cd "$APP_DIR/server"
npm install --no-audit --no-fund --loglevel=error
echo "  جاهز ✓"

# 4) تشغيل
echo "› [4/4] تشغيل يجيب…"
cd "$APP_DIR"
exec bash scripts/start.sh
