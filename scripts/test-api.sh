#!/bin/bash
# E2E-тест API Табеля. Безопасен для данных: делает снимок состояния,
# гоняет все эндпоинты на тестовом профиле и в конце восстанавливает снимок.
set -u
cd /home/z/my-project

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✔ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✘ $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (ожидалось: $2, получено: $1)"; fi }

B=http://127.0.0.1:3000

echo "── 1. health"
check "$(curl -s $B/api/health | jq -r .ok)" "true" "GET /api/health → ok"

echo "── 2. снимок текущего состояния"
curl -s $B/api/state > /tmp/state-before.json
BEFORE_PROFILES=$(jq '.profiles | length' /tmp/state-before.json)
BEFORE_DAYS=$(jq '[.profiles[].months[] | length] | add // 0' /tmp/state-before.json)
echo "  в базе профилей: $BEFORE_PROFILES, дней: $BEFORE_DAYS"

echo "── 3. создание тестового профиля"
PID=$(curl -s -X POST $B/api/profiles -H 'Content-Type: application/json' \
  -d '{"id":"api-test-profile","name":"API Тест","rate":500}' | jq -r '.profile.id')
check "$PID" "api-test-profile" "POST /api/profiles"

echo "── 4. один день: выходной и рабочий 8-19 Склад обед 1 ч"
curl -s -X PUT $B/api/day -H 'Content-Type: application/json' \
  -d '{"profileId":"api-test-profile","date":"2026-10-16","entry":{"off":true,"start":"","end":"","lunch":false,"lunchMin":0,"place":""}}' > /dev/null
curl -s -X PUT $B/api/day -H 'Content-Type: application/json' \
  -d '{"profileId":"api-test-profile","date":"2026-10-17","entry":{"off":false,"start":"08:00","end":"19:00","lunch":true,"lunchMin":60,"place":"Склад"}}' > /dev/null
R=$(curl -s $B/api/state | jq -r '.profiles[] | select(.id=="api-test-profile") | .months["2026-10"]["17"].start')
check "$R" "08:00" "PUT /api/day → день сохранён"
R=$(curl -s $B/api/state | jq -r '.profiles[] | select(.id=="api-test-profile") | .months["2026-10"]["16"].off')
check "$R" "true" "PUT /api/day → выходной сохранён"

echo "── 5. месяц целиком (шаблон)"
DAYS='{"1":{"off":false,"start":"09:00","end":"18:00","lunch":true,"lunchMin":60,"place":"Склад"},"2":{"off":true,"start":"","end":"","lunch":false,"lunchMin":0,"place":""}}'
R=$(curl -s -X PUT $B/api/month -H 'Content-Type: application/json' \
  -d "{\"profileId\":\"api-test-profile\",\"monthKey\":\"2026-11\",\"days\":$DAYS}" | jq -r .days)
check "$R" "2" "PUT /api/month → 2 дня"

echo "── 6. переименование профиля (PATCH)"
R=$(curl -s -X PATCH $B/api/profiles/api-test-profile -H 'Content-Type: application/json' \
  -d '{"name":"API Тест 2","rate":600}' | jq -r '.profile.name')
check "$R" "API Тест 2" "PATCH /api/profiles/:id"

echo "── 7. удаление одного дня"
curl -s -X PUT $B/api/day -H 'Content-Type: application/json' \
  -d '{"profileId":"api-test-profile","date":"2026-11-01","entry":null}' > /dev/null
R=$(curl -s $B/api/state | jq -r '.profiles[] | select(.id=="api-test-profile") | .months["2026-11"] | length')
check "$R" "1" "PUT /api/day entry=null → день удалён"

echo "── 8. валидация (должны быть 400)"
R=$(curl -s -o /dev/null -w "%{http_code}" -X PUT $B/api/day -H 'Content-Type: application/json' \
  -d '{"profileId":"api-test-profile","date":"2026-13-45","entry":null}')
check "$R" "400" "кривая дата → 400"
R=$(curl -s -o /dev/null -w "%{http_code}" -X POST $B/api/profiles -H 'Content-Type: application/json' \
  -d '{"name":""}')
check "$R" "400" "пустое имя → 400"
R=$(curl -s -o /dev/null -w "%{http_code}" -X PUT $B/api/day -H 'Content-Type: application/json' \
  -d '{"profileId":"нет-такого","date":"2026-10-01","entry":null}')
check "$R" "404" "чужой профиль → 404"

echo "── 9. удаление тестового профиля"
R=$(curl -s -X DELETE $B/api/profiles/api-test-profile | jq -r .ok)
check "$R" "true" "DELETE /api/profiles/:id"

echo "── 10. восстановление снимка (импорт)"
if [ "$BEFORE_PROFILES" -gt 0 ]; then
  R=$(curl -s -X POST $B/api/import -H 'Content-Type: application/json' \
    -d "{\"profiles\":$(jq -c '.profiles' /tmp/state-before.json)}" | jq -r '.profiles')
  check "$R" "$BEFORE_PROFILES" "POST /api/import → профили восстановлены"
else
  # база была пуста: импорт пустого массива должен отклоняться (защита от
  # случайной очистки), а непустой импорт — работать; после проверки чистим
  R=$(curl -s -o /dev/null -w "%{http_code}" -X POST $B/api/import \
    -H 'Content-Type: application/json' -d '{"profiles":[]}')
  check "$R" "400" "импорт пустого массива → 400 (защита от очистки)"
  R=$(curl -s -X POST $B/api/import -H 'Content-Type: application/json' \
    -d '{"profiles":[{"id":"tmp-import-check","name":"Времянка","months":{"2026-10":{"16":{"off":false,"start":"09:00","end":"18:00","lunch":true,"lunchMin":60,"place":"Склад"}}}}]}' \
    | jq -r '.profiles')
  check "$R" "1" "POST /api/import → непустой импорт работает"
  curl -s -X DELETE $B/api/profiles/tmp-import-check > /dev/null
fi

echo "── 11. итоговое состояние совпадает со снимком"
curl -s $B/api/state > /tmp/state-after.json
AFTER_PROFILES=$(jq '.profiles | length' /tmp/state-after.json)
AFTER_DAYS=$(jq '[.profiles[].months[] | length] | add // 0' /tmp/state-after.json)
check "$AFTER_PROFILES" "$BEFORE_PROFILES" "профилей как было ($BEFORE_PROFILES)"
check "$AFTER_DAYS" "$BEFORE_DAYS" "дней как было ($BEFORE_DAYS)"
if jq -S . /tmp/state-before.json > /tmp/b.json && jq -S . /tmp/state-after.json > /tmp/a.json && cmp -s /tmp/b.json /tmp/a.json; then
  ok "данные байт-в-байт идентичны снимку"
else
  bad "состояние отличается от снимка (сравнить /tmp/b.json и /tmp/a.json)"
fi

echo ""
echo "ИТОГО: passed=$PASS failed=$FAIL"
[ $FAIL -eq 0 ]
