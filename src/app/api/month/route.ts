// PUT /api/month — заменить весь месяц одним запросом.
// Используется «Заполнить по шаблону», «Скопировать прошлый месяц»
// и «Очистить месяц» (тогда days = {}).
import { db } from '@/lib/db'
import { entryToRow, errMessage, jsonError, monthPutSchema } from '@/lib/server/tabel-api'

export const dynamic = 'force-dynamic'

export async function PUT(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError('Ожидался JSON')
  }

  const parsed = monthPutSchema.safeParse(body)
  if (!parsed.success) return jsonError(errMessage(parsed.error))
  const { profileId, monthKey, days } = parsed.data

  try {
    const exists = await db.profile.findUnique({ where: { id: profileId }, select: { id: true } })
    if (!exists) return jsonError('Профиль не найден', 404)

    const rows = Object.entries(days).map(([d, e]) =>
      entryToRow(`${monthKey}-${String(Number(d)).padStart(2, '0')}`, e),
    )

    await db.$transaction(async (tx) => {
      await tx.dayRow.deleteMany({ where: { profileId, date: { startsWith: `${monthKey}-` } } })
      for (const r of rows) {
        await tx.dayRow.create({ data: { profileId, ...r } })
      }
    })

    return Response.json({ ok: true, days: rows.length })
  } catch (err) {
    console.error('[api/month PUT]', err)
    return jsonError('Не удалось сохранить месяц', 500)
  }
}
