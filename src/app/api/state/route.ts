// GET /api/state — состояние для текущей сессии:
//   profile — свой профиль с записями по месяцам;
//   isAdmin — права админа;
//   profiles — список профилей с настройками (только админу, без месяцев):
//     для диалога «Профили и доступы».
// Без сессии — 401 (клиент показывает экран входа).
import { db } from '@/lib/db'
import { currentProfile, noSession } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

/** строки БД -> { "2026-10": { "16": запись } } */
function groupMonths(days: { date: string; off: boolean; startTime: string; endTime: string; lunch: boolean; lunchMin: number; place: string }[]) {
  return days.reduce<Record<string, Record<string, unknown>>>((acc, r) => {
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
  }, {})
}

export async function GET() {
  const me = await currentProfile()
  if (!me) return noSession()

  try {
    const prof = await db.profile.findUnique({ where: { id: me.id }, include: { days: true } })
    if (!prof) return noSession()

    const profiles = me.isAdmin
      ? (
          await db.profile.findMany({
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              name: true,
              pinHash: true,
              rate: true,
              defStart: true,
              defEnd: true,
              defLunch: true,
              defLunchMin: true,
              defPlace: true,
            },
          })
        ).map((p) => ({
          id: p.id,
          name: p.name,
          hasPin: p.pinHash !== null,
          rate: p.rate,
          defStart: p.defStart,
          defEnd: p.defEnd,
          defLunch: p.defLunch,
          defLunchMin: p.defLunchMin,
          defPlace: p.defPlace,
        }))
      : null

    return Response.json({
      profile: {
        id: prof.id,
        name: prof.name,
        rate: prof.rate,
        defStart: prof.defStart,
        defEnd: prof.defEnd,
        defLunch: prof.defLunch,
        defLunchMin: prof.defLunchMin,
        defPlace: prof.defPlace,
        months: groupMonths(prof.days),
      },
      isAdmin: prof.isAdmin,
      profiles,
    })
  } catch (err) {
    console.error('[api/state]', err)
    return Response.json({ error: 'Не удалось загрузить данные' }, { status: 500 })
  }
}
