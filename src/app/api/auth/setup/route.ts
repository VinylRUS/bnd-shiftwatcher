// POST /api/auth/setup — первый запуск: создать профиль администратора.
// Работает ТОЛЬКО пока на сервере нет ни одного профиля. После создания —
// стандартный путь: задать пинкод (клиент переходит к шагу «Придумайте
// пинкод» и вызывает /api/auth/set-pin).
import { db } from '@/lib/db'
import { authError, normName, setupSchema } from '@/lib/server/auth'
import { errMessage } from '@/lib/server/tabel-api'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return authError('Ожидался JSON')
  }

  const parsed = setupSchema.safeParse(body)
  if (!parsed.success) return authError(errMessage(parsed.error))
  const name = normName(parsed.data.name)
  if (!name) return authError('Введите имя профиля')

  try {
    const count = await db.profile.count()
    if (count > 0) {
      return authError('Профили уже созданы — войдите по имени или пинкоду', 409, 'SETUP_DONE')
    }

    const prof = await db.profile.create({
      data: { id: crypto.randomUUID(), name, isAdmin: true },
    })
    return Response.json({ ok: true, needPin: true, name: prof.name })
  } catch (err) {
    console.error('[api/auth/setup]', err)
    return authError('Не удалось создать профиль', 500)
  }
}
