#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Табель — точка входа контейнера.
#   1. создаём папку базы, если нужно (SQLite живёт в томе /data);
#   2. применяем миграции Prisma (создают/обновляют таблицы);
#   3. запускаем Next.js.
# ─────────────────────────────────────────────────────────────────────────────
set -e

: "${DATABASE_URL:=file:/data/tabel.db}"
export DATABASE_URL

case "$DATABASE_URL" in
  file:/*)
    DB_DIR="$(dirname "${DATABASE_URL#file:}")"
    mkdir -p "$DB_DIR"
    ;;
esac

echo "[tabel] применяю миграции базы (${DATABASE_URL})…"
node ./node_modules/prisma/build/index.js migrate deploy

echo "[tabel] запускаю сервер на ${HOSTNAME:-0.0.0.0}:${PORT:-3000}…"
exec "$@"
