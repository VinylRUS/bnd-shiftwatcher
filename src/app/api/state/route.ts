// GET /api/state — всё состояние: профили с записями по месяцам
// (тот же формат, что ждал клиент от localStorage раньше).
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const profiles = await db.profile.findMany({
      orderBy: { createdAt: 'asc' },
      include: { days: true },
    })
    return Response.json({
      profiles: profiles.map((p) => ({
        id: p.id,
        name: p.name,
        rate: p.rate,
        defStart: p.defStart,
        defEnd: p.defEnd,
        defLunch: p.defLunch,
        defLunchMin: p.defLunchMin,
        defPlace: p.defPlace,
        months: p.days.reduce<Record<string, Record<string, unknown>>>((acc, r) => {
          const mk = r.date.slice(0, 7)
          const day = String(Number(r.date.slice(8, 10)))
          ;(acc[mk] ??= {})[day] = {
            off: r.off,
            start: r.startTime,
            end: r.endTime,
            lunch: r.lunch,
            lunchMin: r.lunchMin,
            place: r.place,
          }
          return acc
        }, {}),
      })),
    })
  } catch (err) {
    console.error('[api/state]', err)
    return Response.json({ error: 'Не удалось загрузить данные' }, { status: 500 })
  }
}
