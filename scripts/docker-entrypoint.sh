#!/bin/sh
# ============================================================
# يجيب — نقطة دخول حاوية Docker
# يولّد JWT_SECRET مرة واحدة ويحفظه في مجلد البيانات المثبَّت
# ============================================================
set -e

DATA_DIR="${DATA_DIR:-/data}"
export DATA_DIR
mkdir -p "$DATA_DIR"

if [ -z "$JWT_SECRET" ]; then
  if [ -f "$DATA_DIR/.jwt_secret" ]; then
    JWT_SECRET="$(tr -d ' \n\r' < "$DATA_DIR/.jwt_secret")"
  else
    JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
    printf '%s' "$JWT_SECRET" > "$DATA_DIR/.jwt_secret"
    echo "› وُلِّد سر جلسة جديد وحُفظ في: $DATA_DIR/.jwt_secret"
  fi
  export JWT_SECRET
fi

cd /opt/yijeeb/server
exec node server.js
