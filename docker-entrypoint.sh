#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Табель — точка входа контейнера (v6).
#
# Работает в ДВУХ моделях запуска:
#   1. «Из образа» — обычный docker run / docker compose по нашему Dockerfile;
#   2. «Репозиторий + node_modules» — модель bothost: образ собирается, но
#      в рантайме платформа кладёт в /app файлы git-репозитория и node_modules
#      из сборки. Эти файлы могут появляться С ЗАДЕРЖКОЙ (гонка при деплое),
#      поэтому точка входа ЖДЁТ нужные файлы, а не падает сразу.
#
# Шаги:
#   1. ждём prisma/migrate.js, PrismaClient и next (оверлей платформы);
#   2. выбираем путь к базе: персистентная папка платформы (data рядом с
#      приложением) → том /data из Dockerfile → последняя надежда рядом
#      с приложением; явный DATABASE_URL всегда важнее;
#   3. применяем миграции (prisma/migrate.js — без Prisma CLI);
#   4. если server.js/.next отсутствуют (модель 2 без образа) — разворачиваем
#      из fallback-копии standalone/, лежащей в репозитории;
#   5. запускаем Next.js.
# ─────────────────────────────────────────────────────────────────────────────
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

# ── ожидание файла/каталога (платформа может досинхронизировать их с гонкой) ─
wait_for() {
  _what="$1"; _max="${2:-90}"; _i=0
  while [ ! -e "$_what" ]; do
    _i=$((_i+1))
    if [ "$_i" -gt "$_max" ]; then
      echo "[tabel] за ${_max} с не появился: $_what" >&2
      return 1
    fi
    if [ "$_i" -eq 1 ]; then
      echo "[tabel] жду $_what (файлы ещё копируются)…"
    elif [ $((_i % 15)) -eq 0 ]; then
      echo "[tabel] всё ещё жду $_what (${_i} с)…"
    fi
    sleep 1
  done
  return 0
}

# ── диагностика: печатаем всё, что нужно для понимания состояния ─────────────
diag() {
  echo "[tabel] ── диагностика ──────────────────────────────────────" >&2
  echo "[tabel] pwd:              $(pwd)" >&2
  echo "[tabel] node:             $(node -v 2>&1)" >&2
  echo "[tabel] DATABASE_URL:     ${DATABASE_URL:-<не задан>}" >&2
  echo "[tabel] содержимое /app:  $(ls -A . 2>/dev/null | tr '\n' ' ')" >&2
  echo "[tabel] node_modules:     $(ls -A node_modules 2>/dev/null | head -30 | tr '\n' ' ')…" >&2
  echo "[tabel] prisma:           $(ls -A prisma 2>/dev/null | tr '\n' ' ')" >&2
  echo "[tabel] server.js:        $([ -f ./server.js ] && echo есть || echo НЕТ)" >&2
  echo "[tabel] .next:            $([ -d ./.next ] && echo есть || echo НЕТ)" >&2
  echo "[tabel] standalone/:      $([ -d ./standalone ] && echo есть || echo НЕТ)" >&2
  echo "[tabel] папка data:       $([ -d "$APP_DIR/data" ] && echo есть || echo нет)" >&2
  echo "[tabel] том /data:        $(awk '$2=="/data"' /proc/mounts 2>/dev/null || echo не смонтирован)" >&2
  echo "[tabel] ──────────────────────────────────────────────────────" >&2
}

# ── 1. ждём файлы приложения ─────────────────────────────────────────────────
if ! wait_for ./prisma/migrate.js 90; then
  echo "[tabel] ОШИБКА: prisma/migrate.js так и не появился в $APP_DIR." >&2
  diag
  exit 1
fi
if ! wait_for ./node_modules/.prisma/client 60; then
  echo "[tabel] ОШИБКА: PrismaClient (node_modules/.prisma/client) не появился." >&2
  diag
  exit 1
fi
if ! wait_for ./node_modules/next 60; then
  echo "[tabel] ОШИБКА: next (node_modules/next) не появился." >&2
  diag
  exit 1
fi

# ── 2. путь к базе ───────────────────────────────────────────────────────────
# Приоритет: явный DATABASE_URL → персистентная папка платформы (data рядом с
# приложением) → том /data из Dockerfile → таблица рядом с приложением.
if [ -z "${DATABASE_URL:-}" ] || [ "${DATABASE_URL}" = "file:/data/tabel.db" ]; then
  if [ -d "$APP_DIR/data" ] && [ -w "$APP_DIR/data" ]; then
    DATABASE_URL="file:$APP_DIR/data/tabel.db"
  elif mkdir -p /data 2>/dev/null && [ -w /data ]; then
    DATABASE_URL="file:/data/tabel.db"
  elif mkdir -p "$APP_DIR/tabel-data" 2>/dev/null && [ -w "$APP_DIR/tabel-data" ]; then
    DATABASE_URL="file:$APP_DIR/tabel-data/tabel.db"
  else
    echo "[tabel] ОШИБКА: не нашёл доступный для записи каталог под базу." >&2
    diag
    exit 1
  fi
fi
export DATABASE_URL

case "$DATABASE_URL" in
  file:/*)
    mkdir -p "$(dirname "${DATABASE_URL#file:}")" 2>/dev/null || true
    ;;
esac

# ── 3. миграции ──────────────────────────────────────────────────────────────
echo "[tabel] применяю миграции базы (${DATABASE_URL})…"
if ! node ./prisma/migrate.js; then
  # файлы могли появиться не полностью — несколько коротких повторов
  echo "[tabel] с первого раза не получилось, повторяю (до 5 попыток)…" >&2
  _try=1
  until node ./prisma/migrate.js; do
    _try=$((_try+1))
    if [ "$_try" -ge 5 ]; then
      echo "[tabel] ОШИБКА: миграции не применились." >&2
      diag
      # запасной путь: если в образе есть полноценный Prisma CLI — пробуем его
      if [ -f ./node_modules/prisma/build/index.js ]; then
        echo "[tabel] пробую штатный prisma migrate deploy…" >&2
        exec node ./node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma
      fi
      exit 1
    fi
    sleep 3
  done
fi

# ── 4. сервер: из образа или из fallback-копии в репозитории ─────────────────
if [ ! -d ./.next ] && [ -d ./standalone/.next ]; then
  echo "[tabel] .next отсутствует — разворачиваю из standalone/…"
  cp -a ./standalone/.next ./.next
fi
if [ ! -f ./server.js ] && [ -f ./standalone/server.js ]; then
  echo "[tabel] server.js отсутствует — разворачиваю из standalone/…"
  cp -a ./standalone/server.js ./server.js
fi
if ! wait_for ./server.js 60; then
  echo "[tabel] ОШИБКА: server.js не появился (и fallback standalone/ не найден)." >&2
  diag
  exit 1
fi

echo "[tabel] запускаю сервер на ${HOSTNAME:-0.0.0.0}:${PORT:-3000}…"
exec "$@"
