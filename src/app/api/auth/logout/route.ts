// POST /api/auth/logout — выйти из профиля (удаляем сессию, чистим cookie).
import { dropCurrentSession, setSessionCookie } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    await dropCurrentSession()
    await setSessionCookie(null)
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[api/auth/logout]', err)
    return Response.json({ error: 'Не удалось выйти' }, { status: 500 })
  }
}
