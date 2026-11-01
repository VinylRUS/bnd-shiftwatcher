#!/bin/bash
# UI E2E Табеля через agent-browser: рендер, правка дня, персистентность,
# формат выгрузки для HR, ошибки консоли, мобильная вёрстка.
set -u
cd /home/z/my-project
B=http://127.0.0.1:3000

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✔ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✘ $1"; }
check_val() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (ожидалось $2, получено $1)"; fi }

# оригинальная запись рабочего дня 18 ноября — восстановим её в конце
ORIG=$(jq -c '.profiles[0].months["2026-11"]["18"]' /tmp/state-before.json)
PROFILE_ID=$(jq -r '.profiles[0].id' /tmp/state-before.json)

echo "── старт сервера"
setsid nohup bun run dev < /dev/null > /tmp/bun-dev.log 2>&1 &
for i in $(seq 1 40); do curl -s -m 2 $B/api/health > /dev/null 2>&1 && break; sleep 1; done
curl -s -m 5 $B/api/health > /dev/null || { echo "сервер не поднялся"; exit 1; }
ok "сервер готов"

mkdir -p /tmp/ui

echo "── 1. загрузка страницы (десктоп)"
agent-browser set viewport 1280 900 > /dev/null
agent-browser open http://127.0.0.1:3000/ > /dev/null
agent-browser wait --load networkidle > /dev/null
agent-browser wait 1500 > /dev/null
agent-browser screenshot /tmp/ui/01-main-desktop.png --full > /dev/null
TITLE=$(agent-browser get title)
echo "$TITLE" | grep -q "Табель" && ok "страница открыта: $TITLE" || bad "страница не открыта: $TITLE"

FOOTER=$(agent-browser eval "document.querySelector('footer')?.innerText || ''" | jq -r .)
echo "$FOOTER" | grep -q "хранятся на сервере" && ok "футер про серверное хранение" || bad "футер: $FOOTER"

echo "── 2. данные ноября на месте"
EXPORT=$(agent-browser eval "document.querySelector('[aria-label=\"Предпросмотр выгрузки\"]')?.innerText || ''" | jq -r .)
LINES=$(echo "$EXPORT" | grep -c "2026" || true)
[ "$LINES" -ge 28 ] && ok "в выгрузке $LINES строк с датами" || bad "в выгрузке всего $LINES строк"

echo "── 3. правка рабочего дня 18 ноября (09:00 → 10:00)"
agent-browser find role button click --name "Изменить 18 число"
agent-browser wait 700 > /dev/null
agent-browser screenshot /tmp/ui/02-day-dialog.png > /dev/null
# у time-input свой ввод по сегментам, поэтому значение ставим нативным сеттером
# React + события input/change — как при ручном вводе
agent-browser eval "(() => { const el = document.getElementById('day-start'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, '10:00'); el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); return el.value; })()"
agent-browser find role button click --name "Сохранить"
agent-browser wait 1500 > /dev/null
R=$(curl -s $B/api/state | jq -r '.profiles[0].months["2026-11"]["18"].start')
check_val "$R" "10:00" "день сохранён на сервере (start=10:00)"

echo "── 4. перезагрузка страницы — изменение на месте"
agent-browser reload > /dev/null
agent-browser wait --load networkidle > /dev/null
agent-browser wait 1500 > /dev/null
EXPORT2=$(agent-browser eval "document.querySelector('[aria-label=\"Предпросмотр выгрузки\"]')?.innerText || ''" | jq -r .)
echo "$EXPORT2" | grep -q "18.11.2026  10-18" && ok "после F5: «18.11.2026  10-18 Склад обед 1 ч»" || bad "после F5 строка дня: $(echo "$EXPORT2" | grep '18.11.2026')"

echo "── 5. точный формат выгрузки для HR"
echo "$EXPORT2" | grep -E "^(01|02|18)\.11\.2026" | sed 's/^/    /'
echo "$EXPORT2" | grep -qE "^02\.11\.2026  Выходной$" && ok "выходной: «02.11.2026  Выходной»" || bad "формат выходного неверен"
echo "$EXPORT2" | grep -qE "^18\.11\.2026  10-18 Склад обед 1 ч$" && ok "рабочий: «18.11.2026  10-18 Склад обед 1 ч»" || bad "формат рабочего дня неверен"
echo "$EXPORT2" | grep -qE "^01\.11\.2026  9-18 Склад без обеда$" && ok "без обеда: «01.11.2026  9-18 Склад без обеда»" || bad "формат «без обеда» неверен"

echo "── 6. ошибки консоли"
ERRORS=$(agent-browser errors 2>/dev/null | grep -v "^$" | head -5 || true)
[ -z "$ERRORS" ] && ok "ошибок в консоли нет" || { bad "ошибки консоли:"; echo "$ERRORS" | sed 's/^/    /'; }

echo "── 7. мобильная вёрстка"
agent-browser set viewport 390 844 > /dev/null
agent-browser wait 600 > /dev/null
agent-browser screenshot /tmp/ui/03-mobile.png --full > /dev/null
ok "мобильный скриншот снят"

echo "── 8. восстановление исходного дня 18"
curl -s -X PUT $B/api/day -H 'Content-Type: application/json' \
  -d "{\"profileId\":\"$PROFILE_ID\",\"date\":\"2026-11-18\",\"entry\":$ORIG}" > /dev/null
R=$(curl -s $B/api/state | jq -r '.profiles[0].months["2026-11"]["18"].start')
ORIG_START=$(echo "$ORIG" | jq -r '.start')
[ "$R" = "$ORIG_START" ] && ok "день 18 восстановлен (start=$R)" || bad "не восстановился: $R ≠ $ORIG_START"

agent-browser close > /dev/null 2>&1
echo ""
echo "ИТОГО: passed=$PASS failed=$FAIL"
[ $FAIL -eq 0 ]
