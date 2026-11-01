// PUT /api/day — сохранить или удалить один день.
// entry: null → удалить запись (день снова «не заполнен»).
import { db } from '@/lib/db'
import { dayPutSchema, entryToRow, errMessage, jsonError } from '@/lib/server/tabel-api'

export const dynamic = 'force-dynamic'

export async function PUT(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError('Ожидался JSON')
  }

  const parsed = dayPutSchema.safeParse(body)
  if (!parsed.success) return jsonError(errMessage(parsed.error))
  const { profileId, date, entry } = parsed.data

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
