// POST /api/auth/login — вход в профиль.
//   { pin }         — вход по 6-значному пинкоду (ищем профиль по хешу);
//   { name }        — первый вход по имени: профиль без пина, в ответ
//                     needPin: true (сессии ещё нет — сначала задаём пин);
//   { profileId, pin } — открыть конкретный профиль по пину
//                     (переключение админом в «Профили и доступы»).
import { db } from '@/lib/db'
import {
  authError,
  clearFails,
  clientIp,
  createSession,
  dropCurrentSession,
  findProfileByName,
  findProfileIdByPin,
  loginSchema,
  recordFail,
  setSessionCookie,
  sweepExpiredSessions,
  tooManyAttempts,
  verifyPin,
} from '@/lib/server/auth'
import { errMessage } from '@/lib/server/tabel-api'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return authError('Ожидался JSON')
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) return authError(errMessage(parsed.error))

  const ip = clientIp(request)
  if (tooManyAttempts(ip)) {
    return authError(
      'Слишком много неудачных попыток. Подождите несколько минут и попробуйте снова.',
      429,
      'RATE_LIMITED',
    )
  }

  const d = parsed.data

  try {
    // ── открыть конкретный профиль (переключение админом) ──────────────────
    if (d.profileId) {
      if (!d.pin) return authError('Нужен пинкод профиля')
      const prof = await db.profile.findUnique({ where: { id: d.profileId } })
      if (!prof || !prof.pinHash) {
        recordFail(ip)
        return authError('Профиль не найден или пин ещё не установлен', 401, 'NOT_FOUND')
      }
      if (!verifyPin(d.pin, prof.pinHash)) {
        recordFail(ip)
        return authError('Неверный пинкод', 401, 'BAD_PIN')
      }
      return await loginOk(prof.id)
    }

    // ── вход по пинкоду ────────────────────────────────────────────────────
    if (d.pin) {
      const id = await findProfileIdByPin(d.pin)
      if (!id) {
        recordFail(ip)
        return authError('Неверный пинкод', 401, 'BAD_PIN')
      }
      return await loginOk(id)
    }

    // ── первый вход по имени (пин ещё не установлен) ───────────────────────
    const prof = await findProfileByName(d.name!)
    if (!prof) {
      recordFail(ip)
      return authError('Профиль с таким именем не найден', 401, 'NOT_FOUND')
    }
    if (prof.pinHash) {
      return authError(
        'Этот профиль уже защищён пинкодом — войдите по пинкоду',
        403,
        'PIN_SET',
      )
    }
    // сессию не создаём: сначала нужно задать пинкод
    clearFails(ip)
    return Response.json({ ok: true, needPin: true, name: prof.name })
  } catch (err) {
    console.error('[api/auth/login]', err)
    return authError('Не удалось выполнить вход', 500)
  }
}

/** создать сессию (перезалогин в этом браузере), поставить cookie */
async function loginOk(profileId: string): Promise<Response> {
  await sweepExpiredSessions()
  await dropCurrentSession()
  const token = await createSession(profileId)
  await setSessionCookie(token)
  const prof = await db.profile.findUnique({ where: { id: profileId } })
  return Response.json({
    ok: true,
    profile: prof ? { id: prof.id, name: prof.name, isAdmin: prof.isAdmin } : null,
  })
}
