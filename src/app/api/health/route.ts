// GET /api/health — проверка живости для Docker HEALTHCHECK.
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await db.profile.count()
    return Response.json({ ok: true, ts: new Date().toISOString() })
  } catch (err) {
    console.error('[api/health]', err)
    return Response.json({ ok: false }, { status: 500 })
  }
}
