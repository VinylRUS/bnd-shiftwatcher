// POST /api/profiles — создать профиль (только админ).
// id генерирует сервер: оптимистичного добавления больше нет, клиент
// ждёт ответа и обновляет список. Новый профиль без пина: при первом
// входе по имени предложит задать пинкод.
import { db } from '@/lib/db'
import { authError, currentProfile, nameTakenBy, normName, noSession } from '@/lib/server/auth'
import { createProfileSchema, errMessage } from '@/lib/server/tabel-api'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const me = await currentProfile()
  if (!me) return noSession()
  if (!me.isAdmin) return authError('Профили создаёт только администратор', 403, 'FORBIDDEN')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return authError('Ожидался JSON')
  }

  const parsed = createProfileSchema.safeParse(body)
  if (!parsed.success) return authError(errMessage(parsed.error))
  const name = normName(parsed.data.name)
  if (!name) return authError('Имя не может быть пустым')

  try {
    if (await nameTakenBy(name)) {
      return authError('Профиль с таким именем уже есть', 409, 'NAME_TAKEN')
    }
    const profile = await db.profile.create({
      data: { id: crypto.randomUUID(), name, isAdmin: false },
    })
    return Response.json({
      profile: { id: profile.id, name: profile.name, hasPin: false },
    })
  } catch (err) {
    console.error('[api/profiles POST]', err)
    return authError('Не удалось создать профиль', 500)
  }
}
