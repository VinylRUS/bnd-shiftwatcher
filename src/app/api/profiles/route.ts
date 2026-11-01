// POST /api/profiles — создать профиль.
// id можно передать с клиента (uuid), чтобы оптимистичный интерфейс
// и сервер жили с одним идентификатором.
import { db } from '@/lib/db'
import { createProfileSchema, errMessage, jsonError } from '@/lib/server/tabel-api'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError('Ожидался JSON')
  }

  const parsed = createProfileSchema.safeParse(body)
  if (!parsed.success) return jsonError(errMessage(parsed.error))
  const d = parsed.data

  try {
    // если такой id уже есть (повтор запроса) — просто обновляем и возвращаем
    const profile = d.id
      ? await db.profile.upsert({
          where: { id: d.id },
          update: {
            name: d.name,
            rate: d.rate,
            defStart: d.defStart,
            defEnd: d.defEnd,
            defLunch: d.defLunch,
            defLunchMin: d.defLunchMin,
            defPlace: d.defPlace,
          },
          create: {
            id: d.id,
            name: d.name,
            rate: d.rate,
            defStart: d.defStart,
            defEnd: d.defEnd,
            defLunch: d.defLunch,
            defLunchMin: d.defLunchMin,
            defPlace: d.defPlace,
          },
        })
      : await db.profile.create({ data: { name: d.name, rate: d.rate } })

    return Response.json({
      profile: { ...profile, months: {} },
    })
  } catch (err) {
    console.error('[api/profiles POST]', err)
    return jsonError('Не удалось создать профиль', 500)
  }
}
