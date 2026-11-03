// GET /api/auth/state — публичный: есть ли на сервере профили.
// Нужно экрану входа, чтобы отличить первый запуск (создание админа)
// от обычного входа по пину/имени.
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const count = await db.profile.count()
    return Response.json({ hasProfiles: count > 0 })
  } catch (err) {
    console.error('[api/auth/state]', err)
    return Response.json({ error: 'Сервер недоступен' }, { status: 500 })
  }
}
