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
  let workDays = 0
  let totalHours = 0
  let lunchHours = 0
  let maxHours = 0
  for (let d = 1; d <= dim; d++) {
    const e = entries[String(d)]
    const h = dayHours(e)
    if (h === null) continue
    workDays += 1
    totalHours += h
    if (e!.lunch) lunchHours += e!.lunchMin / 60
    if (h > maxHours) maxHours = h
  }
  totalHours = Math.round(totalHours * 100) / 100
  return {
    days: dim,
    workDays,
    totalHours,
    lunchHours: Math.round(lunchHours * 100) / 100,
    avgHours: workDays ? Math.round((totalHours / workDays) * 100) / 100 : 0,
    maxHours,
    salary: profile.rate ? Math.round(totalHours * profile.rate) : null,
  }
}

/**
 * Полная выгрузка за месяц — по строке на каждый день.
 * withHeader: добавить шапку с именем и итогами (по умолчанию выключена,
 * чтобы формат совпадал с требованием HR один в один).
 */
export function buildExport(profile: Profile, y: number, m: number, withHeader: boolean): string {
  const lines: string[] = []
  if (withHeader) {
    const st = monthStats(profile, y, m)
    lines.push(`${profile.name} — ${MONTHS_RU[m].toLowerCase()} ${y} г.`)
    const parts = [`рабочих дней: ${st.workDays}`, `всего часов: ${fmtNum(st.totalHours)}`]
    if (st.salary !== null) parts.push(`примерная ЗП: ${fmtMoney(st.salary)}`)
    lines.push(parts.join(', '))
    lines.push('')
  }
  const entries = profile.months[monthKey(y, m)] ?? {}
  const dim = daysInMonth(y, m)
  for (let d = 1; d <= dim; d++) {
    lines.push(exportLine(new Date(y, m, d), entries[String(d)]))
  }
  return lines.join('\n')
}
