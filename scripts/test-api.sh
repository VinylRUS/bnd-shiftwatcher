#!/bin/bash
# E2E-тест API Табеля (v9 — с авторизацией по пинкоду).
# Безопасен для данных: работает с отдельным тестовым профилем и удаляет
# его в конце. Все проверки идут через cookie-сессии, как настоящий клиент.
#
# Переменные:
#   ADMIN_NAME / ADMIN_PIN — имя и пин АДМИНА (по умолчанию Егор/111111 —
#   тестовые значения локальной базы). На чистой базе скрипт сам создаст
#   адмиина с этими данными (первый запуск).
set -u
cd "$(cd "$(dirname "$0")" && pwd)/.."

ADMIN_NAME="${ADMIN_NAME:-Егор}"
ADMIN_PIN="${ADMIN_PIN:-111111}"
TEST_NAME="API Тест"
TEST_PIN="654321"

B=http://127.0.0.1:3000
JAR_ADMIN=/tmp/tabel-test-admin.jar
JAR_TEST=/tmp/tabel-test-test.jar
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✔ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✘ $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (ожидалось: '$2', получено: '$1')"; fi }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

rm -f "$JAR_ADMIN" "$JAR_TEST"

echo "── 1. health и состояние"
check "$(curl -s $B/api/health | jq -r .ok)" "true" "GET /api/health → ok"
H=$(curl -s $B/api/auth/state | jq -r .hasProfiles)
[ "$H" = "true" ] || [ "$H" = "false" ] && ok "GET /api/auth/state → hasProfiles=$H" || bad "GET /api/auth/state"

echo "── 2. без сессии API закрыт"
check "$(code $B/api/state)" "401" "GET /api/state без входа → 401"
check "$(code -X PUT $B/api/day -H 'Content-Type: application/json' -d '{}')" "401" "PUT /api/day без входа → 401"
check "$(code -X POST $B/api/profiles -H 'Content-Type: application/json' -d '{"name":"X"}')" "401" "POST /api/profiles без входа → 401"

echo "── 3. вход админом"
R=$(curl -s -c "$JAR_ADMIN" -X POST $B/api/auth/login \
  -H 'Content-Type: application/json' -d "{\"pin\":\"$ADMIN_PIN\"}")
if [ "$(echo "$R" | jq -r '.profile.isAdmin // empty')" = "true" ]; then
  ok "вход по пину $ADMIN_PIN → $(echo "$R" | jq -r .profile.name)"
else
  # чистая база: создаём первого профиля (он станет админом)
  curl -s -X POST $B/api/auth/setup -H 'Content-Type: application/json' \
    -d "{\"name\":\"$ADMIN_NAME\"}" | jq -e '.needPin' > /dev/null \
    && ok "первый запуск: профиль «$ADMIN_NAME» создан" || bad "setup"
  R=$(curl -s -c "$JAR_ADMIN" -X POST $B/api/auth/set-pin \
    -H 'Content-Type: application/json' -d "{\"name\":\"$ADMIN_NAME\",\"pin\":\"$ADMIN_PIN\"}")
  check "$(echo "$R" | jq -r '.profile.isAdmin // empty')" "true" "пин установлен, вход выполнен (админ)"
fi
check "$(curl -s -b "$JAR_ADMIN" $B/api/state | jq -r .isAdmin)" "true" "GET /api/state → isAdmin=true"

# подчистка от прошлого прогона (если профиль остался)
OLD=$(curl -s -b "$JAR_ADMIN" $B/api/state | jq -r --arg n "$TEST_NAME" '.profiles[]? | select(.name==$n) | .id' | head -1)
if [ -n "$OLD" ]; then
  curl -s -b "$JAR_ADMIN" -X DELETE $B/api/profiles/$OLD > /dev/null
  echo "  (подчищен профиль «$TEST_NAME» от прошлого прогона)"
fi

echo "── 4. создание тестового профиля (админ)"
PID=$(curl -s -b "$JAR_ADMIN" -X POST $B/api/profiles \
  -H 'Content-Type: application/json' -d "{\"name\":\"$TEST_NAME\"}" | jq -r '.profile.id // empty')
if [ -z "$PID" ]; then
  echo "  ✘ не удалось создать тестовый профиль — продолжать нет смысла"
  echo "Итого: ✔ $PASS  ✘ $((FAIL+1))"
  exit 1
fi
ok "POST /api/profiles → $PID"
check "$(curl -s -b "$JAR_ADMIN" -X POST $B/api/profiles -H 'Content-Type: application/json' -d "{\"name\":\"$TEST_NAME\"}" | jq -r .code)" "NAME_TAKEN" "дубль имени → NAME_TAKEN"

echo "── 5. первый вход по имени → установка пина"
R=$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' -d "{\"name\":\"  $TEST_NAME \"}")
check "$(echo "$R" | jq -r '.needPin // empty')" "true" "вход по имени (регистр/пробелы) → needPin"
R=$(curl -s -c "$JAR_TEST" -X POST $B/api/auth/set-pin \
  -H 'Content-Type: application/json' -d "{\"name\":\"$TEST_NAME\",\"pin\":\"$TEST_PIN\"}")
check "$(echo "$R" | jq -r '.ok // empty')" "true" "set-pin → сессия тестового профиля"
check "$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' -d "{\"name\":\"$TEST_NAME\"}" | jq -r .code)" "PIN_SET" "повторный вход по имени → PIN_SET"
check "$(code -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"pin":"000000"}')" "401" "неверный пин → 401"

echo "── 6. изоляция профилей"
check "$(curl -s -b "$JAR_TEST" $B/api/state | jq -r .profile.id)" "$PID" "state отдаёт только свой профиль"
check "$(curl -s -b "$JAR_TEST" $B/api/state | jq -r '.profiles // "null"')" "null" "список профилей обычному пользователю не отдаётся"
check "$(code -b "$JAR_TEST" $B/api/export-all)" "403" "GET /api/export-all не админу → 403"
check "$(code -b "$JAR_TEST" -X PUT $B/api/day -H 'Content-Type: application/json' \
  -d "{\"profileId\":\"not-my-profile\",\"date\":\"2026-10-16\",\"entry\":{\"off\":true,\"start\":\"\",\"end\":\"\",\"lunch\":false,\"lunchMin\":0,\"place\":\"\"}}")" "403" "чужой профиль в PUT /api/day → 403"

echo "── 7. дни и месяцы тестового профиля"
curl -s -b "$JAR_TEST" -X PUT $B/api/day -H 'Content-Type: application/json' \
  -d "{\"profileId\":\"$PID\",\"date\":\"2026-10-16\",\"entry\":{\"off\":false,\"start\":\"08:00\",\"end\":\"19:00\",\"lunch\":true,\"lunchMin\":60,\"place\":\"Склад\"}}" > /dev/null
check "$(curl -s -b "$JAR_TEST" $B/api/state | jq -r ".profile.months[\"2026-10\"][\"16\"].start")" "08:00" "PUT /api/day → день сохранён"
DAYS='{"1":{"off":false,"start":"09:00","end":"18:00","lunch":true,"lunchMin":60,"place":"Склад"},"2":{"off":true,"start":"","end":"","lunch":false,"lunchMin":0,"place":""}}'
curl -s -b "$JAR_TEST" -X PUT $B/api/month -H 'Content-Type: application/json' \
  -d "{\"profileId\":\"$PID\",\"monthKey\":\"2026-11\",\"days\":$DAYS}" | jq -e '.ok' > /dev/null \
  && ok "PUT /api/month → месяц сохранён" || bad "PUT /api/month"

echo "── 8. смена своего пина"
check "$(curl -s -b "$JAR_TEST" -X POST $B/api/auth/pin -H 'Content-Type: application/json' \
  -d '{"currentPin":"000000","newPin":"765432"}' | jq -r '.code // empty')" "BAD_CURRENT" "неверный текущий пин → BAD_CURRENT"
check "$(code -b "$JAR_TEST" -X POST $B/api/auth/pin -H 'Content-Type: application/json' \
  -d "{\"currentPin\":\"$TEST_PIN\",\"newPin\":\"$ADMIN_PIN\"}")" "409" "пин, занятый другим профилем → 409"
PINCH=$(curl -s -b "$JAR_TEST" -X POST $B/api/auth/pin -H 'Content-Type: application/json' \
  -d "{\"currentPin\":\"$TEST_PIN\",\"newPin\":\"765432\"}")
check "$(echo "$PINCH" | jq -r '.ok // .error // empty')" "true" "смена пина $TEST_PIN → 765432"

echo "── 9. админ: сброс/установка пина, бэкап, удаление"
check "$(curl -s -b "$JAR_ADMIN" -X POST $B/api/profiles/$PID/pin -H 'Content-Type: application/json' \
  -d '{"pin":null}' | jq -r .hasPin)" "false" "сброс пина → hasPin=false"
check "$(curl -s -b "$JAR_ADMIN" -X POST $B/api/profiles/$PID/pin -H 'Content-Type: application/json' \
  -d "{\"pin\":\"$ADMIN_PIN\"}" | jq -r .code)" "PIN_TAKEN" "задать чужой пин → PIN_TAKEN"
curl -s -b "$JAR_ADMIN" -X POST $B/api/profiles/$PID/pin -H 'Content-Type: application/json' \
  -d '{"pin":"999999"}' | jq -e '.ok' > /dev/null && ok "установка пина 999999" || bad "установка пина"
N=$(curl -s -b "$JAR_ADMIN" $B/api/export-all | jq '.profiles | length')
[ "$N" -ge 2 ] && ok "GET /api/export-all → профилей: $N" || bad "export-all"
check "$(code -b "$JAR_ADMIN" -X DELETE $B/api/profiles/not-exists-123)" "200" "удаление несуществующего → ок (идемпотентно)"
curl -s -b "$JAR_ADMIN" -X DELETE $B/api/profiles/$PID | jq -e '.ok' > /dev/null \
  && ok "удаление тестового профиля" || bad "удаление тестового профиля"

echo "── 10. выход"
curl -s -b "$JAR_ADMIN" -X POST $B/api/auth/logout | jq -e '.ok' > /dev/null && ok "logout админа" || bad "logout"
check "$(code -b "$JAR_ADMIN" $B/api/state)" "401" "после logout state → 401"

echo
echo "Итого: ✔ $PASS  ✘ $FAIL"
rm -f "$JAR_ADMIN" "$JAR_TEST"
[ "$FAIL" = "0" ]
