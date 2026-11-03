// POST /api/import — заменить все данные (восстановление из резервной копии).
// Только админ. Первый профиль копии становится админом; пинкоды в копии
// не хранятся — после восстановления все входят по имени и задают пин заново.
import { db } from '@/lib/db'
import { authError, currentProfile, noSession } from '@/lib/server/auth'
import { errMessage, importSchema, jsonError, monthsToRows } from '@/lib/server/tabel-api'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const me = await currentProfile()
  if (!me) return noSession()
  if (!me.isAdmin) return authError('Восстановление копии — только администратору', 403, 'FORBIDDEN')
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
        // смещаем createdAt, чтобы порядок профилей сохранялся как в копии;
        // первый профиль копии становится админом
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
            isAdmin: i === 0,
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
