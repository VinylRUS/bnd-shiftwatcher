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
    mkdir -p "$DB_DIR" 2>/dev/null || true
    ;;
esac

# Prisma CLI должен был попасть в образ на этапе сборки (см. Dockerfile).
# Если его нет — это старый/сломанный образ, честно об этом говорим.
if [ ! -f ./node_modules/prisma/build/index.js ]; then
  echo "[tabel] ОШИБКА: в образе нет Prisma CLI (node_modules/prisma)." >&2
  echo "[tabel] Пересоберите образ без кэша:" >&2
  echo "[tabel]   docker compose down && docker compose build --no-cache && docker compose up -d" >&2
  exit 1
fi

echo "[tabel] применяю миграции базы (${DATABASE_URL})…"
node ./node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma

echo "[tabel] запускаю сервер на ${HOSTNAME:-0.0.0.0}:${PORT:-3000}…"
exec "$@"
