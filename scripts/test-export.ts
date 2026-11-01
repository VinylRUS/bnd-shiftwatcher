// Проверка формата выгрузки для HR на реальном коде приложения
import { buildExport, exportLine, dayHours, halfRange, halfStats, makeTestProfile, periodStats } from './test-helpers'

const p = makeTestProfile()

// дни из примера пользователя
const set = (d: number, e: any) => {
  p.months['2026-10'] ??= {}
  p.months['2026-10'][String(d)] = e
}
set(16, { off: true, start: '', end: '', lunch: false, lunchMin: 0, place: '' })
set(17, { off: false, start: '08:00', end: '19:00', lunch: true, lunchMin: 60, place: 'Склад' })
set(18, { off: false, start: '09:00', end: '19:00', lunch: true, lunchMin: 60, place: 'Склад' })
set(24, { off: false, start: '09:00', end: '18:00', lunch: false, lunchMin: 0, place: 'Склад' })
set(25, { off: false, start: '09:00', end: '18:00', lunch: false, lunchMin: 0, place: 'Склад' })
set(31, { off: false, start: '09:00', end: '20:00', lunch: false, lunchMin: 0, place: 'Склад' })

const line = (d: number) => exportLine(new Date(2026, 9, d), p.months['2026-10'][String(d)])

const checks: Array<[string, boolean]> = [
  ['16: Выходной', line(16) === '16.10.2026  Выходной'],
  ['17: 8-19 обед', line(17) === '17.10.2026  8-19 Склад обед 1 ч'],
  ['18: 9-19 обед', line(18) === '18.10.2026  9-19 Склад обед 1 ч'],
  ['24: без обеда', line(24) === '24.10.2026  9-18 Склад без обеда'],
  ['31: 9-20 без обеда', line(31) === '31.10.2026  9-20 Склад без обеда'],
  ['17: часы = 10', dayHours(p.months['2026-10']['17']) === 10],
  ['31: часы = 11', dayHours(p.months['2026-10']['31']) === 11],
  ['24: часы = 9', dayHours(p.months['2026-10']['24']) === 9],
  ['полный экспорт: 31 строка', buildExport(p, 2026, 9, false).split('\n').length === 31],
  ['шапка выключена по умолчанию', !buildExport(p, 2026, 9, false).includes('Всего часов')],
  ['шапка: первая строка с именем', buildExport(p, 2026, 9, true).split('\n')[0].includes('Иван')],
]

// ночная смена 20:00-06:00 без обеда = 10 ч
const overnight = dayHours({ off: false, start: '20:00', end: '06:00', lunch: false, lunchMin: 0, place: '' })
checks.push(['ночная смена 20-6 = 10 ч', overnight === 10])

// обед 1,5 ч
const lunch90 = dayHours({ off: false, start: '09:00', end: '18:00', lunch: true, lunchMin: 90, place: '' })
checks.push(['обед 1,5 ч: 9-18 = 7,5 ч', lunch90 === 7.5])

// ─── половины месяца (1–15 и 16–конец) ───────────────────────────────────────
// октябрь 2026: 31 день; все рабочие дни теста — во второй половине
const [h1, h2] = halfStats(p, 2026, 9)
checks.push(['границы 1-й половины: 1–15', JSON.stringify(halfRange(1, 2026, 9)) === '{"from":1,"to":15}'])
checks.push(['границы 2-й половины: 16–31', JSON.stringify(halfRange(2, 2026, 9)) === '{"from":16,"to":31}'])
checks.push(['февраль 2026 (28): 16–28', halfRange(2, 2026, 1).to === 28])
checks.push(['февраль 2024 (29, високосный): 16–29', halfRange(2, 2024, 1).to === 29])
checks.push(['1-я половина: 0 дн., 0 ч', h1.workDays === 0 && h1.totalHours === 0])
checks.push(['2-я половина: 5 дн., 48 ч', h2.workDays === 5 && h2.totalHours === 48])
checks.push(['ЗП половин: 0 ₽ и 24 000 ₽', h1.salary === 0 && h2.salary === 24000])

const ps = periodStats(p, 2026, 9, 'month')
checks.push(['periodStats месяц = месяцу', ps.workDays === 5 && ps.totalHours === 48 && ps.salary === 24000])
checks.push(['periodStats 1-я = пусто', periodStats(p, 2026, 9, 'first').totalHours === 0])
checks.push(['periodStats 2-я = 48 ч', periodStats(p, 2026, 9, 'second').totalHours === 48])

const first = buildExport(p, 2026, 9, false, 'first').split('\n')
checks.push(['выгрузка 1-й: 15 строк', first.length === 15])
checks.push(['выгрузка 1-я: начинается с 01.10', first[0] === '01.10.2026  Выходной'])
checks.push(['выгрузка 1-я: кончается 15.10', first[14] === '15.10.2026  Выходной'])

const second = buildExport(p, 2026, 9, false, 'second').split('\n')
checks.push(['выгрузка 2-й: 16 строк', second.length === 16])
checks.push(['выгрузка 2-я: начинается с 16.10', second[0] === '16.10.2026  Выходной'])
checks.push(['выгрузка 2-я: кончается 31.10', second[15] === '31.10.2026  9-20 Склад без обеда'])

const withHeader = buildExport(p, 2026, 9, true, 'month').split('\n')
// toLocaleString('ru-RU') даёт неразрывные пробелы в числах — нормализуем к обычным
const norm = (s: string) => s.replace(/\u00A0/g, ' ')
checks.push(['шапка: строка 1-й половины', norm(withHeader[2]) === '1-я половина (1–15): 0 раб. дн., 0 ч, 0 ₽'])
checks.push(['шапка: строка 2-й половины', norm(withHeader[3]) === '2-я половина (16–31): 5 раб. дн., 48 ч, 24 000 ₽'])

const secondHeader = buildExport(p, 2026, 9, true, 'second').split('\n')
checks.push([
  'шапка 2-й: заголовок с периодом',
  secondHeader[0] === 'Иван — октябрь 2026 г., 2-я половина (16–31)',
])
checks.push([
  'шапка 2-й: итоги половины',
  norm(secondHeader[1]) === 'рабочих дней: 5, всего часов: 48, примерная ЗП: 24 000 ₽',
])
checks.push(['шапка 2-й: без разбивки по половинам', !secondHeader.slice(0, 4).some((l) => l.includes('1-я половина'))])

let failed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? '✓' : '✗ FAIL'} ${name}`)
  if (!ok) failed++
}
if (failed) {
  console.log(`\n${failed} проверок не прошло`)
  process.exit(1)
}
console.log('\nВсе проверки формата пройдены ✓')
