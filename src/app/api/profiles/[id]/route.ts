// PATCH /api/profiles/:id — обновить настройки профиля
// DELETE /api/profiles/:id — удалить профиль вместе с его днями (каскад)
import { db } from '@/lib/db'
import { errMessage, jsonError, profilePatchSchema } from '@/lib/server/tabel-api'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Ctx) {
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
    const profile = await db.profile.update({ where: { id }, data: parsed.data })
    return Response.json({ profile: { ...profile, months: {} } })
  } catch (err) {
    console.error('[api/profiles PATCH]', err)
    return jsonError('Профиль не найден или не обновлён', 404)
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params
  try {
    await db.profile.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch {
    // профиль уже исчез — это тоже успех
    return Response.json({ ok: true })
  }
}
