// Серверная логика Табеля: валидация (zod) и преобразование записей
// между строками БД (DayRow) и клиентским форматом (DayEntry / months).
import { z } from 'zod'
import type { DayEntry } from '@/lib/tabel'

// ─── форматы ────────────────────────────────────────────────────────────────

const RE_TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const RE_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const RE_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const RE_ID = /^[^\s]{1,64}$/

export const timeSchema = z
  .string()
  .max(5)
  .regex(RE_TIME)
  .or(z.literal(''))
  .default('')

// ─── схемы запросов ─────────────────────────────────────────────────────────

export const dayEntrySchema = z.object({
  off: z.boolean().default(false),
  start: timeSchema,
  end: timeSchema,
  lunch: z.boolean().default(false),
  lunchMin: z.number().int().min(0).max(360).default(0),
  place: z.string().max(60).default(''),
})

/** { [день месяца 1..31]: запись } */
export const monthDaysSchema = z.record(
  z.string().regex(/^(0?[1-9]|[12]\d|3[01])$/),
  dayEntrySchema,
)

export const profileFieldsSchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().trim().min(1, 'Имя не может быть пустым').max(60),
  rate: z.number().nullable().default(null),
  defStart: z.string().max(5).default('09:00'),
  defEnd: z.string().max(5).default('18:00'),
  defLunch: z.boolean().default(true),
  defLunchMin: z.number().int().min(0).max(360).default(60),
  defPlace: z.string().max(60).default('Склад'),
})

export const profilePatchSchema = z.object({
  name: z.string().trim().min(1, 'Имя не может быть пустым').max(60).optional(),
  rate: z.number().nullable().optional(),
  defStart: z.string().max(5).optional(),
  defEnd: z.string().max(5).optional(),
  defLunch: z.boolean().optional(),
  defLunchMin: z.number().int().min(0).max(360).optional(),
  defPlace: z.string().max(60).optional(),
})

export const createProfileSchema = profileFieldsSchema

export const dayPutSchema = z.object({
  profileId: z.string().regex(RE_ID),
  date: z.string().regex(RE_DATE, 'Некорректная дата'),
  entry: dayEntrySchema.nullable(),
})

export const monthPutSchema = z.object({
  profileId: z.string().regex(RE_ID),
  monthKey: z.string().regex(RE_MONTH, 'Некорректный месяц'),
  days: monthDaysSchema,
})

export const importSchema = z.object({
  profiles: z
    .array(
      z.object({
        id: z.string().max(64).optional(),
        name: z.string().trim().min(1).max(60),
        rate: z.number().nullable().default(null),
        defStart: z.string().max(5).default('09:00'),
        defEnd: z.string().max(5).default('18:00'),
        defLunch: z.boolean().default(true),
        defLunchMin: z.number().int().min(0).max(360).default(60),
        defPlace: z.string().max(60).default('Склад'),
        months: z.record(z.string().regex(RE_MONTH), monthDaysSchema).default({}),
      }),
    )
    .min(1, 'Нужен хотя бы один профиль')
    .max(100, 'Слишком много профилей'),
})

// ─── преобразования ─────────────────────────────────────────────────────────

export type DayRowPayload = {
  date: string
  off: boolean
  startTime: string
  endTime: string
  lunch: boolean
  lunchMin: number
  place: string
}

/** клиентская запись -> поля строки БД */
export function entryToRow(date: string, e: DayEntry): DayRowPayload {
  return {
    date,
    off: e.off,
    startTime: e.start ?? '',
    endTime: e.end ?? '',
    lunch: e.lunch,
    lunchMin: e.lunchMin ?? 0,
    place: (e.place ?? '').slice(0, 60),
  }
}

/** { "2026-10": { "16": запись } } -> плоский список строк БД */
export function monthsToRows(months: Record<string, Record<string, DayEntry>>): DayRowPayload[] {
  const rows: DayRowPayload[] = []
  for (const [mk, days] of Object.entries(months ?? {})) {
    if (!RE_MONTH.test(mk)) continue
    for (const [d, e] of Object.entries(days ?? {})) {
      const day = Number(d)
      if (!Number.isInteger(day) || day < 1 || day > 31) continue
      const date = `${mk}-${String(day).padStart(2, '0')}`
      rows.push(entryToRow(date, e))
    }
  }
  return rows
}

/** ответ с ошибкой */
export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

/** достаём человекочитаемую ошибку из zod/исключения */
export function errMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'issues' in err && Array.isArray((err as { issues: unknown[] }).issues)) {
    const first = (err as { issues: Array<{ path: Array<string | number>; message: string }> }).issues[0]
    if (first) return `${first.message}${first.path.length ? ` (${first.path.join('.')})` : ''}`
  }
  if (err instanceof Error) return err.message
  return 'Неизвестная ошибка'
}
