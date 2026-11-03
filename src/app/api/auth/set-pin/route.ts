// POST /api/auth/set-pin — задать пинкод профилю, у которого его ещё нет
// (первый вход по имени). После установки сразу создаётся сессия:
// человек задал пин и вошёл в профиль.
import { db } from '@/lib/db'
import {
  authError,
  clearFails,
  clientIp,
  createSession,
  dropProfileSessions,
  findProfileByName,
  hashPin,
  pinTakenBy,
  recordFail,
  setPinSchema,
  setSessionCookie,
  tooManyAttempts,
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

  const parsed = setPinSchema.safeParse(body)
  if (!parsed.success) return authError(errMessage(parsed.error))
  const { name, pin } = parsed.data

  const ip = clientIp(request)
  if (tooManyAttempts(ip)) {
    return authError('Слишком много попыток. Подождите несколько минут.', 429, 'RATE_LIMITED')
  }

  try {
    const prof = await findProfileByName(name)
    if (!prof) {
      recordFail(ip)
      return authError('Профиль с таким именем не найден', 401, 'NOT_FOUND')
    }
    if (prof.pinHash) {
      return authError('Пинкод этому профилю уже установлен', 409, 'PIN_SET')
    }
    if (await pinTakenBy(pin)) {
      recordFail(ip)
      return authError('Этот пинкод уже используется другим профилем', 409, 'PIN_TAKEN')
    }

    await db.profile.update({ where: { id: prof.id }, data: { pinHash: hashPin(pin) } })
    // старых сессий быть не должно, но подстрахуемся
    await dropProfileSessions(prof.id)
    const token = await createSession(prof.id)
    await setSessionCookie(token)
    clearFails(ip)

    return Response.json({ ok: true, profile: { id: prof.id, name: prof.name, isAdmin: prof.isAdmin } })
  } catch (err) {
    console.error('[api/auth/set-pin]', err)
    return authError('Не удалось установить пинкод', 500)
  }
}
