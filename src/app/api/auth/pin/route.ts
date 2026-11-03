// POST /api/auth/pin — сменить СВОЙ пинкод (нужен текущий).
// Прочие сессии профиля сбрасываются, текущая — остаётся.
import { db } from '@/lib/db'
import {
  authError,
  changePinSchema,
  clientIp,
  currentProfile,
  dropProfileSessions,
  hashPin,
  pinTakenBy,
  recordFail,
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

  const parsed = changePinSchema.safeParse(body)
  if (!parsed.success) return authError(errMessage(parsed.error))
  const { currentPin, newPin } = parsed.data

  const me = await currentProfile()
  if (!me) return authError('Нужен вход в профиль', 401, 'NO_SESSION')

  try {
    const prof = await db.profile.findUnique({ where: { id: me.id } })
    if (!prof) return authError('Профиль не найден', 404, 'NOT_FOUND')
    if (!prof.pinHash) {
      return authError('У профиля ещё нет пинкода — задайте его при входе по имени', 409, 'PIN_SET')
    }
    if (!verifyPin(currentPin, prof.pinHash)) {
      recordFail(clientIp(request))
      return authError('Текущий пинкод неверен', 401, 'BAD_CURRENT')
    }
    if (await pinTakenBy(newPin, prof.id)) {
      return authError('Этот пинкод уже используется другим профилем', 409, 'PIN_TAKEN')
    }

    await db.profile.update({ where: { id: prof.id }, data: { pinHash: hashPin(newPin) } })
    // остальные устройства должны переспросить пин, это — нет
    await dropProfileSessions(prof.id, true)

    return Response.json({ ok: true })
  } catch (err) {
    console.error('[api/auth/pin]', err)
    return authError('Не удалось сменить пинкод', 500)
  }
}
