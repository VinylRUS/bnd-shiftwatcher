// Проверка формата выгрузки для HR на реальном коде приложения
import { buildExport, exportLine, dayHours, makeTestProfile } from './test-helpers'

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
