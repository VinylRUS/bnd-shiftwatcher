// Авторизация Табеля (v9): пинкоды, сессии, cookie, защита от перебора.
//
// Модель доступа:
//   • вход в профиль — по 6-значному пинкоду (хеш scrypt, случайная соль);
//   • пока пин не установлен, первый вход выполняется ПО ИМЕНИ профиля —
//     сразу после этого профиль обязан задать пин;
//   • админ (первый/старейший профиль) создаёт профили, управляет ими
//     и может сбросить/задать пин любого профиля, кроме своего;
//   • сессия — случайный токен в httpOnly-cookie tabel_session,
//     строка в таблице Session, срок 30 дней.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import { db } from '@/lib/db'

export const SESSION_COOKIE = 'tabel_session'
const SESSION_MS = 30 * 24 * 60 * 60 * 1000

// ─── пинкод ─────────────────────────────────────────────────────────────────

const PIN_RE = /^\d{6}$/

/** ровно 6 цифр */
export const pinSchema = z.string().regex(PIN_RE, 'Пинкод — ровно 6 цифр')

/** хеш вида s1$<соль hex>$<ключ hex> */
export function hashPin(pin: string): string {
  const salt = randomBytes(16)
  const key = scryptSync(pin, salt, 64)
  return `s1$${salt.toString('hex')}$${key.toString('hex')}`
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 's1') return false
  try {
    const salt = Buffer.from(parts[1], 'hex')
    const key = Buffer.from(parts[2], 'hex')
    if (key.length === 0) return false
    return timingSafeEqual(scryptSync(pin, salt, key.length), key)
  } catch {
    return false
  }
}

/** найти id профиля по пинкоду (профилей немного — перебор хешей дёшев) */
export async function findProfileIdByPin(pin: string): Promise<string | null> {
  const all = await db.profile.findMany({ select: { id: true, pinHash: true } })
  for (const p of all) if (verifyPin(pin, p.pinHash)) return p.id
  return null
}

/** занят ли пинкод другим профилем (excludeId — самого себя не проверяем) */
export async function pinTakenBy(pin: string, excludeId?: string): Promise<boolean> {
  const all = await db.profile.findMany({ select: { id: true, pinHash: true } })
  for (const p of all) {
    if (excludeId && p.id === excludeId) continue
    if (verifyPin(pin, p.pinHash)) return true
  }
  return false
}

// ─── имена ──────────────────────────────────────────────────────────────────

/** нормализуем имя: трим + схлопывание пробелов */
export function normName(name: unknown): string {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : ''
}

/** поиск профиля по имени без учёта регистра (первый по дате создания) */
export async function findProfileByName(name: string) {
  const want = normName(name).toLowerCase()
  if (!want) return null
  const all = await db.profile.findMany({ orderBy: { createdAt: 'asc' } })
  return (
    all.find((p) => normName(p.name).toLowerCase() === want) ?? null
  )
}

/** имя свободно ли (для создания/переименования), кроме профиля excludeId */
export async function nameTakenBy(name: string, excludeId?: string): Promise<boolean> {
  const want = normName(name).toLowerCase()
  if (!want) return true
  const all = await db.profile.findMany({ select: { id: true, name: true } })
  for (const p of all) {
    if (excludeId && p.id === excludeId) continue
    if (normName(p.name).toLowerCase() === want) return true
  }
  return false
}

// ─── сессии ─────────────────────────────────────────────────────────────────

export type SessionProfile = {
  id: string
  name: string
  isAdmin: boolean
  hasPin: boolean
}

export async function createSession(profileId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await db.session.create({
    data: { token, profileId, expiresAt: new Date(Date.now() + SESSION_MS) },
  })
  return token
}

/** положить/убрать cookie сессии (Secure — только за https-прокси) */
export async function setSessionCookie(token: string | null): Promise<void> {
  const jar = await cookies()
  const h = await headers()
  const secure = (h.get('x-forwarded-proto') ?? '').split(',')[0].trim() === 'https'
  jar.set(SESSION_COOKIE, token ?? '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge: token ? Math.floor(SESSION_MS / 1000) : 0,
  })
}

/** текущий токен из cookie (или null) */
export async function currentToken(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(SESSION_COOKIE)?.value ?? null
}

/** удалить сессию текущего браузера (выход / перезалогин) */
export async function dropCurrentSession(): Promise<void> {
  const token = await currentToken()
  if (token) await db.session.deleteMany({ where: { token } })
}

/** удалить сессии профиля; keepCurrent — не трогать сессию этого браузера */
export async function dropProfileSessions(profileId: string, keepCurrent = false): Promise<void> {
  const keep = keepCurrent ? await currentToken() : null
  await db.session.deleteMany({
    where: { profileId, ...(keep ? { token: { not: keep } } : {}) },
  })
}

/** подчистить просроченные сессии (вызываем изредка при входе) */
export async function sweepExpiredSessions(): Promise<void> {
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
}

/** профиль текущей сессии или null (включая мягкую уборку истёкшей) */
export async function currentProfile(): Promise<SessionProfile | null> {
  const token = await currentToken()
  if (!token) return null
  const s = await db.session.findUnique({ where: { token }, include: { profile: true } })
  if (!s) return null
  if (s.expiresAt < new Date()) {
    await db.session.delete({ where: { id: s.id } }).catch(() => {})
    return null
  }
  return {
    id: s.profile.id,
    name: s.profile.name,
    isAdmin: s.profile.isAdmin,
    hasPin: s.profile.pinHash !== null,
  }
}

// ─── защита от перебора пинкода ─────────────────────────────────────────────
// Простой in-memory счётчик неудач по IP: 10 промахов за 10 минут → пауза.
// Приложение одно-процессное, этого достаточно.

const WINDOW_MS = 10 * 60 * 1000
const MAX_FAILS = 10
const fails = new Map<string, { n: number; reset: number }>()

export function clientIp(request: Request): string {
  const xf = request.headers.get('x-forwarded-for')
  return (xf ? xf.split(',')[0].trim() : '') || 'local'
}

export function tooManyAttempts(ip: string): boolean {
  const rec = fails.get(ip)
  return !!rec && rec.n >= MAX_FAILS && Date.now() < rec.reset
}

export function recordFail(ip: string): void {
  const now = Date.now()
  const rec = fails.get(ip)
  if (!rec || now >= rec.reset) fails.set(ip, { n: 1, reset: now + WINDOW_MS })
  else rec.n += 1
  if (fails.size > 1000) for (const [k, v] of fails) if (now >= v.reset) fails.delete(k)
}

export function clearFails(ip: string): void {
  fails.delete(ip)
}

// ─── схемы запросов и ошибки ────────────────────────────────────────────────

export const loginSchema = z
  .object({
    /** вход по пинкоду */
    pin: pinSchema.optional(),
    /** первый вход по имени (пин ещё не установлен) */
    name: z.string().trim().min(1).max(60).optional(),
    /** открыть конкретный профиль по пинкоду (переключение админом) */
    profileId: z.string().min(1).max(64).optional(),
  })
  .refine((v) => v.pin || v.name || v.profileId, { message: 'Пустой запрос' })

export const setPinSchema = z.object({
  name: z.string().trim().min(1, 'Введите имя').max(60),
  pin: pinSchema,
})

export const changePinSchema = z.object({
  currentPin: pinSchema,
  newPin: pinSchema,
})

export const setupSchema = z.object({
  name: z.string().trim().min(1, 'Введите имя').max(60),
})

export const adminPinSchema = z.object({
  /** null — сбросить пин (следующий вход снова по имени) */
  pin: pinSchema.nullable(),
})

/** ответ с ошибкой; code — машина для клиента (BAD_CURRENT и т.п.) */
export function authError(message: string, status = 400, code?: string): Response {
  return Response.json({ error: message, ...(code ? { code } : {}) }, { status })
}

/** 401 без сессии — единый ответ для всех защищённых роутов */
export function noSession(): Response {
  return authError('Нужен вход в профиль', 401, 'NO_SESSION')
}
