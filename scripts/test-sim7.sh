#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Симуляция деплоя v7 БЕЗ Docker (в песочнице Docker нет).
#
# Проверяем главную идею v7: приложение целиком в /srv/tabel (аналог —
# $SIM/srv/tabel), точка входа НЕ читает /app и ничего не ждёт.
#
# Тесты:
#   1. Модель bothost: /app = git-репозиторий БЕЗ артефактов сборки
#      (нет server.js, .next, node_modules) → сервер всё равно работает,
#      база ложится в /app/data (персистентная папка платформы).
#   2. Модель docker compose: том /data → база в /data/tabel.db,
#      данные переживают рестарт контейнера.
#   3. Фолбэк: ни /app, ни /data → база рядом с приложением.
# Во всех трёх — полный E2E test-api.sh (16 проверок) на порту 3100.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SIM=/tmp/sim7
SRC=/home/z/my-project
REPO=/tmp/gitwork/repo
PORT=3100
BASE="http://127.0.0.1:$PORT"

command -v curl >/dev/null || { echo 'НЕТ curl'; exit 1; }
command -v jq   >/dev/null || { echo 'НЕТ jq';   exit 1; }

echo "═══ подготовка $SIM ═══"
rm -rf "$SIM"
mkdir -p "$SIM/srv/tabel"
# «слои образа» = автономная сборка Next.js целиком
cp -a "$SRC/.next/standalone/." "$SIM/srv/tabel/"
rm -f "$SIM/srv/tabel/.env"                      # в образ .env не попадает
mkdir -p "$SIM/srv/tabel/.next"
cp -a "$SRC/.next/static" "$SIM/srv/tabel/.next/static"
cp -a "$SRC/public"   "$SIM/srv/tabel/public"
cp -a "$SRC/prisma"   "$SIM/srv/tabel/prisma"
cp    "$SRC/docker-entrypoint.sh" "$SIM/srv/tabel/"

# тестовая копия entrypoint с подменой путей (в песочнице нельзя создать /app)
python3 - "$SIM" <<'PY'
import sys
sim = sys.argv[1]
src = open('/home/z/my-project/docker-entrypoint.sh').read()
for old, new in [
    ('mkdir -p /app/data',          f'mkdir -p {sim}/app/data'),
    ('[ -d /app/data ]',            f'[ -d {sim}/app/data ]'),
    ('[ -w /app/data ]',            f'[ -w {sim}/app/data ]'),
    ('file:/app/data/tabel.db',     f'file:{sim}/app/data/tabel.db'),
    ('[ -d /app ]',                 f'[ -d {sim}/app ]'),
    ('file:/data/tabel.db',         f'file:{sim}/data/tabel.db'),
    ('[ -w /data ]',                f'[ -w {sim}/data ]'),
    ('[ -d /data ]',                f'[ -d {sim}/data ]'),
    ('mkdir -p /srv/tabel/data',    f'mkdir -p {sim}/srv/tabel/data'),
    ('file:/srv/tabel/data/tabel.db', f'file:{sim}/srv/tabel/data/tabel.db'),
    ('cd /srv/tabel',               f'cd {sim}/srv/tabel'),
]:
    assert old in src, f'в entrypoint нет строки: {old}'
    src = src.replace(old, new)
open(f'{sim}/srv/tabel/docker-entrypoint-sim.sh', 'w').write(src)
print('[sim] docker-entrypoint-sim.sh написан (пути /app,/data,/srv/tabel → симуляция)')
PY

# E2E на порт 3100
sed "s|http://127.0.0.1:3000|$BASE|g" "$SRC/scripts/test-api.sh" > "$SIM/test-api-sim.sh"

SERVER_PID=""
# env -u DATABASE_URL — имитация чистого контейнера (на bothost она не задана;
# в песочнице же она указывает на дев-базу и маскирует проверку выбора пути)
start_server() {
  env -u DATABASE_URL PORT=$PORT sh "$SIM/srv/tabel/docker-entrypoint-sim.sh" node server.js \
    > "$SIM/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 30); do
    curl -sf "$BASE/api/health" >/dev/null 2>&1 && { echo "[sim] сервер поднялся (pid $SERVER_PID)"; return 0; }
    sleep 1
  done
  echo "✘ сервер не поднялся за 30 с; лог:"; cat "$SIM/server.log"; exit 1
}
expect_log() {  # $1 — что ждём в логе, $2 — сообщение
  grep -q "$1" "$SIM/server.log" || { echo "✘ в логе нет: $1"; cat "$SIM/server.log"; exit 1; }
  echo "✔ $2"
}
stop_server() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  sleep 1
  SERVER_PID=""
}

echo
echo "═══ ТЕСТ 1 · модель bothost: /app = git-репо, артефактов НЕТ ═══"
mkdir -p "$SIM/app"
git -C "$REPO" archive HEAD | tar -x -C "$SIM/app"
rm -rf "$SIM/app/standalone"          # в v7-репо его больше не будет
echo "[sim] в /app есть: $(ls -A "$SIM/app" | tr '\n' ' ')"
[ ! -e "$SIM/app/server.js" ]    && echo "✔ /app/server.js нет (как на bothost)"
[ ! -e "$SIM/app/.next" ]        && echo "✔ /app/.next нет (как на bothost)"
[ ! -e "$SIM/app/node_modules" ] && echo "✔ /app/node_modules нет"
start_server
expect_log "file:$SIM/app/data/tabel.db" "база выбралась в app/data (персистентная папка платформы)"
[ -f "$SIM/app/data/tabel.db" ] && echo "✔ файл базы лежит в app/data" || { echo '✘ файла базы нет в app/data'; exit 1; }
grep -qi "жду" "$SIM/server.log" && { echo "✘ в логе есть ожидания!"; exit 1; } || echo "✔ никаких ожиданий файлов"
bash "$SIM/test-api-sim.sh"
stop_server

echo
echo "═══ ТЕСТ 2 · модель docker compose: том /data + персистентность ═══"
rm -rf "$SIM/app"                      # на compose /app не существует вовсе
mkdir -p "$SIM/data"                   # именованный том
start_server
expect_log "file:$SIM/data/tabel.db" "база выбралась в том /data"
[ -f "$SIM/data/tabel.db" ] && echo "✔ файл базы лежит в /data" || { echo '✘ файла базы нет в /data'; exit 1; }
# создадим профиль и проверим, что он переживёт «пересоздание контейнера»
curl -s -X POST "$BASE/api/profiles" -H 'Content-Type: application/json' \
  -d '{"id":"persist-check","name":"Персистентность","rate":500}' >/dev/null
stop_server
start_server
N=$(curl -s "$BASE/api/state" | jq '[.profiles[] | select(.id=="persist-check")] | length')
[ "$N" = "1" ] && echo "✔ профиль пережил рестарт контейнера (данные в томе)" || { echo '✘ профиль пропал после рестарта'; exit 1; }
expect_log "новых миграций нет" "повторные миграции идемпотентны"
bash "$SIM/test-api-sim.sh"
stop_server

echo
echo "═══ ТЕСТ 3 · фолбэк: ни /app, ни /data ═══"
rm -rf "$SIM/data"
start_server
expect_log "file:$SIM/srv/tabel/data/tabel.db" "база легла рядом с приложением (с предупреждением в логе)"
expect_log "ВНИМАНИЕ: персистентного хранилища" "в логе есть предупреждение о неперсистентности"
bash "$SIM/test-api-sim.sh"
stop_server

echo
echo "═══ ИТОГ: все три модели запуска работают, E2E пройден ═══"
