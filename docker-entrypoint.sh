#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Табель — точка входа контейнера (v5).
#   1. создаём папку базы, если нужно (SQLite живёт в томе /data);
#   2. применяем миграции — prisma/migrate.js, БЕЗ Prisma CLI
#      (скрипту нужен только PrismaClient, который в образе и так —
#      без него не запустится сам сервер);
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

# при любой проблеме печатаем состав образа — сразу видно, что не так
diag() {
  echo "[tabel] ── диагностика образа ──────────────────────────" >&2
  echo "[tabel] pwd:            $(pwd)" >&2
  echo "[tabel] node:           $(node -v 2>&1)" >&2
  echo "[tabel] содержимое /:   $(ls -A . 2>/dev/null | tr '\n' ' ')" >&2
  echo "[tabel] node_modules:   $(ls node_modules 2>/dev/null | head -25 | tr '\n' ' ')…" >&2
  echo "[tabel] prisma:         $(ls -A prisma 2>/dev/null | tr '\n' ' ')" >&2
  echo "[tabel] ────────────────────────────────────────────────" >&2
}

if [ ! -f ./prisma/migrate.js ]; then
  echo "[tabel] ОШИБКА: в образе нет prisma/migrate.js — образ собран из неполного контекста." >&2
  diag
  exit 1
fi

echo "[tabel] применяю миграции базы (${DATABASE_URL})…"
if ! node ./prisma/migrate.js; then
  echo "[tabel] ОШИБКА: миграции не применились." >&2
  diag
  # запасной путь: если в образе вдруг есть полноценный Prisma CLI
  # (например, образ собрали с полным node_modules) — пробуем штатно
  if [ -f ./node_modules/prisma/build/index.js ]; then
    echo "[tabel] пробую prisma migrate deploy…" >&2
    exec node ./node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma
  fi
  exit 1
fi

echo "[tabel] запускаю сервер на ${HOSTNAME:-0.0.0.0}:${PORT:-3000}…"
exec "$@"
