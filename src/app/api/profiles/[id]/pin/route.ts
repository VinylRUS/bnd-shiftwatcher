// POST /api/profiles/:id/pin — задать или сбросить пинкод профиля (админ).
//   { pin: "123456" } — задать (например, передать коллеге готовый пин);
//   { pin: null }     — сбросить: следующий вход снова по имени.
// Своему профилю менять отсюда нельзя — для этого есть смена пинкода
// в настройках (нужен текущий пин). Сессии профиля сбрасываются.
import { db } from '@/lib/db'
import {
  adminPinSchema,
  authError,
  currentProfile,
  dropProfileSessions,
  hashPin,
  pinTakenBy,
  noSession,
} from '@/lib/server/auth'
import { errMessage } from '@/lib/server/tabel-api'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
  const me = await currentProfile()
  if (!me) return noSession()
  if (!me.isAdmin) return authError('Управлять пинкодами может только администратор', 403, 'FORBIDDEN')

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return authError('Ожидался JSON')
  }

  const parsed = adminPinSchema.safeParse(body)
  if (!parsed.success) return authError(errMessage(parsed.error))
  const { pin } = parsed.data

  try {
    const target = await db.profile.findUnique({ where: { id } })
    if (!target) return authError('Профиль не найден', 404, 'NOT_FOUND')
    if (target.id === me.id) {
      return authError(
        'Для своего профиля используйте смену пинкода в настройках',
        400,
        'SELF',
      )
    }

    if (pin === null) {
      await db.profile.update({ where: { id }, data: { pinHash: null } })
      await dropProfileSessions(id)
      return Response.json({ ok: true, hasPin: false })
    }

    if (await pinTakenBy(pin, id)) {
      return authError('Этот пинкод уже используется другим профилем', 409, 'PIN_TAKEN')
    }
    await db.profile.update({ where: { id }, data: { pinHash: hashPin(pin) } })
    await dropProfileSessions(id)
    return Response.json({ ok: true, hasPin: true })
  } catch (err) {
    console.error('[api/profiles/:id/pin]', err)
    return authError('Не удалось изменить пинкод', 500)
  }
}
