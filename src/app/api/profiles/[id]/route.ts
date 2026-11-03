// PATCH /api/profiles/:id — обновить настройки профиля.
//   свой профиль — можно всем; чужой — только админу.
// DELETE /api/profiles/:id — удалить профиль (только админ, не свой).
import { db } from '@/lib/db'
import { authError, currentProfile, nameTakenBy, normName, noSession } from '@/lib/server/auth'
import { errMessage, jsonError, profilePatchSchema } from '@/lib/server/tabel-api'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Ctx) {
  const me = await currentProfile()
  if (!me) return noSession()

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError('Ожидался JSON')
  }

  const parsed = profilePatchSchema.safeParse(body)
  if (!parsed.success) return jsonError(errMessage(parsed.error))

  try {
    const target = await db.profile.findUnique({ where: { id }, select: { id: true } })
    if (!target) return jsonError('Профиль не найден', 404)
    if (target.id !== me.id && !me.isAdmin) {
      return authError('Это не ваш профиль', 403, 'FORBIDDEN')
    }

    const data = { ...parsed.data }
    if (data.name !== undefined) {
      const name = normName(data.name)
      if (!name) return jsonError('Имя не может быть пустым')
      if (await nameTakenBy(name, id)) {
        return authError('Профиль с таким именем уже есть', 409, 'NAME_TAKEN')
      }
      data.name = name
    }

    const profile = await db.profile.update({ where: { id }, data })
    return Response.json({ profile: { ...profile, months: {} } })
  } catch (err) {
    console.error('[api/profiles PATCH]', err)
    return jsonError('Профиль не найден или не обновлён', 404)
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const me = await currentProfile()
  if (!me) return noSession()
  if (!me.isAdmin) return authError('Удалять профили может только администратор', 403, 'FORBIDDEN')

  const { id } = await params

  try {
    if (id === me.id) {
      return authError('Нельзя удалить свой профиль — сначала создайте другой', 400, 'SELF')
    }
    const target = await db.profile.findUnique({ where: { id }, select: { id: true } })
    // уже удалён — это тоже успех (идемпотентность)
    if (!target) return Response.json({ ok: true })
    const count = await db.profile.count()
    if (count <= 1) {
      return authError('Нужен хотя бы один профиль', 400, 'LAST')
    }
    // сессии профиля удалятся каскадом — на его устройствах попросят вход
    await db.profile.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[api/profiles DELETE]', err)
    return jsonError('Не удалось удалить профиль', 500)
  }
}
