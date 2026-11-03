// GET /api/export-all — все профили с записями (только админ).
// Полная резервная копия: обычному пользователю доступен только свой
// профиль, поэтому копию «всего табеля» делает админ.
import { db } from '@/lib/db'
import { authError, currentProfile, noSession } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const me = await currentProfile()
  if (!me) return noSession()
  if (!me.isAdmin) return authError('Резервная копия всего табеля — только администратору', 403, 'FORBIDDEN')

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
    console.error('[api/export-all]', err)
    return Response.json({ error: 'Не удалось выгрузить данные' }, { status: 500 })
  }
}
