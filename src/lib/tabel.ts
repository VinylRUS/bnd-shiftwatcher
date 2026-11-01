// ─── Ядро Табеля: типы, расчёт часов, формат выгрузки для HR ────────────────

export type DayEntry = {
  /** true — выходной */
  off: boolean
  /** "09:00" */
  start: string
  /** "18:00" */
  end: string
  /** есть обед */
  lunch: boolean
  /** длительность обеда, минут */
  lunchMin: number
  /** место работы, напр. "Склад" */
  place: string
}

export type Profile = {
  id: string
  name: string
  /** ставка ₽ за час; null — не задана */
  rate: number | null
  // шаблон рабочего дня по умолчанию
  defStart: string
  defEnd: string
  defLunch: boolean
  defLunchMin: number
  defPlace: string
  /** "2026-10" -> { "16": DayEntry } */
  months: Record<string, Record<string, DayEntry>>
}

export const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

/** родительный падеж: «16 октября» */
export const MONTHS_RU_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

export const WD_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export const LUNCH_OPTIONS = [
  { value: 30, label: '30 мин' },
  { value: 45, label: '45 мин' },
  { value: 60, label: '1 ч' },
  { value: 90, label: '1 ч 30 мин' },
  { value: 120, label: '2 ч' },
]

// ─── даты ───────────────────────────────────────────────────────────────────

export function monthKey(y: number, m: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}

/** 0 = Пн … 6 = Вс */
export function isoWeekday(d: Date): number {
  return (d.getDay() + 6) % 7
}

export function monthTitle(y: number, m: number): string {
  return `${MONTHS_RU[m]} ${y}`
}

// ─── время и часы ───────────────────────────────────────────────────────────

/** "09:30" -> 570 (минут от полуночи) */
export function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** 540 -> "09:00" */
export function minutesToTime(min: number): string {
  const h24 = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(h24 / 60)).padStart(2, '0')}:${String(h24 % 60).padStart(2, '0')}`
}

/** смена переходит на следующие сутки (например 20:00–06:00) */
export function isOvernight(e: DayEntry | undefined | null): boolean {
  if (!e || e.off || !e.start || !e.end) return false
  return parseTime(e.end) <= parseTime(e.start)
}

/** часы за день с учётом обеда; null — не рабочий день */
export function dayHours(e: DayEntry | undefined | null): number | null {
  if (!e || e.off || !e.start || !e.end) return null
  let min = parseTime(e.end) - parseTime(e.start)
  if (min <= 0) min += 24 * 60 // ночная смена
  if (e.lunch) min -= e.lunchMin
  return Math.round((min / 60) * 100) / 100
}

// ─── форматирование ─────────────────────────────────────────────────────────

/** "09:00" -> "9", "09:30" -> "9:30" (как в выгрузке для HR) */
export function fmtTimeShort(t: string): string {
  const [h, m] = t.split(':').map(Number)
  if (!m) return String(h)
  return `${h}:${String(m).padStart(2, '0')}`
}

/** 60 -> "1 ч", 30 -> "30 мин", 90 -> "1 ч 30 мин" */
export function fmtLunchShort(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  const parts: string[] = []
  if (h) parts.push(`${h} ч`)
  if (m) parts.push(`${m} мин`)
  return parts.join(' ') || '0 мин'
}

/** 8 -> "8", 8.5 -> "8,5", 168 -> "168" */
export function fmtNum(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
  })
}

/** 84000 -> "84 000 ₽" */
export function fmtMoney(n: number): string {
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`
}

/** "2026-10-16"-подобная строка даты в формате dd.mm.yyyy */
function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

// ─── выгрузка для HR ────────────────────────────────────────────────────────

/**
 * Строка выгрузки в точном формате HR:
 *   16.10.2026  Выходной
 *   17.10.2026  8-19 Склад обед 1 ч
 *   24.10.2026  9-18 Склад без обеда
 */
export function exportLine(d: Date, e: DayEntry | undefined): string {
  const date = fmtDate(d)
  if (!e || e.off || !e.start || !e.end) return `${date}  Выходной`
  const range = `${fmtTimeShort(e.start)}-${fmtTimeShort(e.end)}`
  const tail = [e.place.trim(), e.lunch ? `обед ${fmtLunchShort(e.lunchMin)}` : 'без обеда']
    .filter(Boolean)
    .join(' ')
  return `${date}  ${range} ${tail}`
}

type RangeAcc = { workDays: number; totalHours: number; lunchHours: number; maxHours: number }

/** сбор итогов по диапазону дней [from..to] включительно */
function collectRange(entries: Record<string, DayEntry>, from: number, to: number): RangeAcc {
  const acc: RangeAcc = { workDays: 0, totalHours: 0, lunchHours: 0, maxHours: 0 }
  for (let d = from; d <= to; d++) {
    const e = entries[String(d)]
    const h = dayHours(e)
    if (h === null) continue
    acc.workDays += 1
    acc.totalHours += h
    if (e!.lunch) acc.lunchHours += e!.lunchMin / 60
    if (h > acc.maxHours) acc.maxHours = h
  }
  acc.totalHours = Math.round(acc.totalHours * 100) / 100
  acc.lunchHours = Math.round(acc.lunchHours * 100) / 100
  return acc
}

export type MonthStats = {
  days: number
  workDays: number
  totalHours: number
  lunchHours: number
  avgHours: number
  maxHours: number
  salary: number | null
}

export function monthStats(profile: Profile, y: number, m: number): MonthStats {
  const entries = profile.months[monthKey(y, m)] ?? {}
  const dim = daysInMonth(y, m)
  const a = collectRange(entries, 1, dim)
  return {
    days: dim,
    workDays: a.workDays,
    totalHours: a.totalHours,
    lunchHours: a.lunchHours,
    avgHours: a.workDays ? Math.round((a.totalHours / a.workDays) * 100) / 100 : 0,
    maxHours: a.maxHours,
    salary: profile.rate ? Math.round(a.totalHours * profile.rate) : null,
  }
}

// ─── половины месяца (аванс / расчёт): 1–15 и 16–конец ──────────────────────

/** последняя дата первой половины месяца */
export const FIRST_HALF_END = 15

/** границы половины: 1 → [1..15], 2 → [16..конец (31/30/29/28)] */
export function halfRange(half: 1 | 2, y: number, m: number): { from: number; to: number } {
  const dim = daysInMonth(y, m)
  return half === 1
    ? { from: 1, to: Math.min(FIRST_HALF_END, dim) }
    : { from: Math.min(FIRST_HALF_END + 1, dim), to: dim }
}

export type HalfStats = {
  half: 1 | 2
  from: number
  to: number
  workDays: number
  totalHours: number
  /** ставка ₽/час × часы половины; null — ставка не задана */
  salary: number | null
}

/** итоги по двум половинам месяца: [1-я (1–15), 2-я (16–конец)] */
export function halfStats(profile: Profile, y: number, m: number): [HalfStats, HalfStats] {
  const entries = profile.months[monthKey(y, m)] ?? {}
  const mk = (half: 1 | 2): HalfStats => {
    const { from, to } = halfRange(half, y, m)
    const a = collectRange(entries, from, to)
    return {
      half,
      from,
      to,
      workDays: a.workDays,
      totalHours: a.totalHours,
      salary: profile.rate ? Math.round(a.totalHours * profile.rate) : null,
    }
  }
  return [mk(1), mk(2)]
}

// ─── период выгрузки ────────────────────────────────────────────────────────

/** весь месяц | 1-я половина (1–15) | 2-я половина (16–конец) */
export type ExportPeriod = 'month' | 'first' | 'second'

export type PeriodStats = {
  workDays: number
  totalHours: number
  salary: number | null
}

/** итоги за период выгрузки (весь месяц или половину) */
export function periodStats(
  profile: Profile,
  y: number,
  m: number,
  period: ExportPeriod,
): PeriodStats {
  const entries = profile.months[monthKey(y, m)] ?? {}
  const half = period === 'second' ? 2 : 1
  const from = period === 'month' ? 1 : halfRange(half, y, m).from
  const to = period === 'month' ? daysInMonth(y, m) : halfRange(half, y, m).to
  const a = collectRange(entries, from, to)
  return {
    workDays: a.workDays,
    totalHours: a.totalHours,
    salary: profile.rate ? Math.round(a.totalHours * profile.rate) : null,
  }
}

/**
 * Полная выгрузка — по строке на каждый день периода.
 * withHeader: добавить шапку с именем и итогами (по умолчанию выключена,
 * чтобы формат совпадал с требованием HR один в один).
 * period: 'month' — все дни месяца; 'first' — только 1–15;
 * 'second' — только 16–конец месяца.
 */
export function buildExport(
  profile: Profile,
  y: number,
  m: number,
  withHeader: boolean,
  period: ExportPeriod = 'month',
): string {
  const lines: string[] = []
  const half = period === 'second' ? 2 : 1
  const range = period === 'month' ? { from: 1, to: daysInMonth(y, m) } : halfRange(half, y, m)
  if (withHeader) {
    const st = periodStats(profile, y, m, period)
    const rangeLabel =
      period === 'month' ? '' : `, ${period === 'first' ? '1-я' : '2-я'} половина (${range.from}–${range.to})`
    lines.push(`${profile.name} — ${MONTHS_RU[m].toLowerCase()} ${y} г.${rangeLabel}`)
    const parts = [`рабочих дней: ${st.workDays}`, `всего часов: ${fmtNum(st.totalHours)}`]
    if (st.salary !== null) parts.push(`примерная ЗП: ${fmtMoney(st.salary)}`)
    lines.push(parts.join(', '))
    if (period === 'month') {
      // разбивка по половинам — аванс и расчёт
      for (const h of halfStats(profile, y, m)) {
        const hp = [
          `${h.half === 1 ? '1-я' : '2-я'} половина (${h.from}–${h.to}): ${h.workDays} раб. дн., ${fmtNum(h.totalHours)} ч`,
        ]
        if (h.salary !== null) hp.push(fmtMoney(h.salary))
        lines.push(hp.join(', '))
      }
    }
    lines.push('')
  }
  const entries = profile.months[monthKey(y, m)] ?? {}
  for (let d = range.from; d <= range.to; d++) {
    lines.push(exportLine(new Date(y, m, d), entries[String(d)]))
  }
  return lines.join('\n')
}
