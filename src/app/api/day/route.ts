// PUT /api/day — сохранить или удалить один день.
// entry: null → удалить запись (день снова «не заполнен»).
// Доступен только свой профиль: чтобы править чужой, нужно войти в него
// по его пинкоду.
import { db } from '@/lib/db'
import { authError, currentProfile, noSession } from '@/lib/server/auth'
import { dayPutSchema, entryToRow, errMessage, jsonError } from '@/lib/server/tabel-api'

export const dynamic = 'force-dynamic'

export async function PUT(request: Request) {
  const me = await currentProfile()
  if (!me) return noSession()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError('Ожидался JSON')
  }

  const parsed = dayPutSchema.safeParse(body)
  if (!parsed.success) return jsonError(errMessage(parsed.error))
  const { profileId, date, entry } = parsed.data

  if (profileId !== me.id) {
    return authError('Доступен только ваш профиль', 403, 'FORBIDDEN')
  }

  try {
    const exists = await db.profile.findUnique({ where: { id: profileId }, select: { id: true } })
    if (!exists) return jsonError('Профиль не найден', 404)

    if (entry === null) {
      await db.dayRow.deleteMany({ where: { profileId, date } })
      return Response.json({ ok: true, deleted: true })
    }

    const data = entryToRow(date, entry)
    await db.dayRow.upsert({
      where: { profileId_date: { profileId, date } },
      update: data,
      create: { profileId, ...data },
    })
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[api/day PUT]', err)
    return jsonError('Не удалось сохранить день', 500)
  }
}
