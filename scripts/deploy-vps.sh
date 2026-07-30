#!/usr/bin/env bash
set -euo pipefail

#===== (Deployment Configuration) ======
APP_NAME="${PM2_APP_NAME:-apps-batari-backend}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

#===== (Project Validation) ======
if [ ! -f package.json ]; then
  echo "package.json tidak ditemukan. Jalankan script ini dari repo backend."
  exit 1
fi

#===== (Environment Validation) ======
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo ".env belum ada, jadi .env dibuat dari .env.example."
    echo "Isi DB_PASSWORD dan JWT_SECRET di .env, lalu jalankan script ini lagi."
  else
    echo ".env dan .env.example tidak ditemukan."
  fi
  exit 1
fi

if grep -Eq "CHANGE_ME|CHANGE_ME_DB_PASSWORD|CHANGE_ME_JWT_SECRET" .env; then
  echo ".env masih berisi placeholder. Ganti dulu password/JWT secret sebelum deploy."
  exit 1
fi

#===== (Install and Verify) ======
npm install
npm test

#===== (PM2 Start or Restart) ======
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start npm --name "$APP_NAME" -- start
fi

#===== (Persist PM2 Process) ======
pm2 save
pm2 status "$APP_NAME"
