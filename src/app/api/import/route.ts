// POST /api/import — заменить все данные (восстановление из резервной копии
// или перенос со старой локальной версии сайта).
import { db } from '@/lib/db'
import { errMessage, importSchema, jsonError, monthsToRows } from '@/lib/server/tabel-api'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError('Ожидался JSON')
  }

  const parsed = importSchema.safeParse(body)
  if (!parsed.success) return jsonError(`Файл не похож на копию Табеля: ${errMessage(parsed.error)}`)
  const profiles = parsed.data.profiles

  try {
    let days = 0
    const base = Date.now()
    await db.$transaction(async (tx) => {
      await tx.profile.deleteMany()
      for (let i = 0; i < profiles.length; i++) {
        const p = profiles[i]
        // смещаем createdAt, чтобы порядок профилей сохранялся как в копии
        await tx.profile.create({
          data: {
            id: p.id ?? crypto.randomUUID(),
            name: p.name,
            rate: p.rate,
            defStart: p.defStart,
            defEnd: p.defEnd,
            defLunch: p.defLunch,
            defLunchMin: p.defLunchMin,
            defPlace: p.defPlace,
            createdAt: new Date(base + i),
            days: {
              create: monthsToRows(p.months),
            },
          },
        })
        days += Object.values(p.months).reduce((n, m) => n + Object.keys(m).length, 0)
      }
    })
    return Response.json({ ok: true, profiles: profiles.length, days })
  } catch (err) {
    console.error('[api/import]', err)
    return jsonError('Не удалось восстановить данные', 500)
  }
}
