import { createClient } from '@supabase/supabase-js'
import { sb } from './db.js'

/** التحقق إن الريكوست جاي من أدمن مسجّل (Supabase Auth + جدول admins) */
export async function verifyAdmin(req: any): Promise<{ ok: boolean; email?: string }> {
  try {
    const auth = req.headers['authorization'] || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token) return { ok: false }
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
    const anon = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY || '', {
      auth: { persistSession: false }
    })
    const { data, error } = await anon.auth.getUser(token)
    if (error || !data?.user?.email) return { ok: false }
    const email = data.user.email.toLowerCase()
    const { data: adm } = await sb().from('admins').select('email').eq('email', email).maybeSingle()
    if (!adm) return { ok: false }
    return { ok: true, email }
  } catch {
    return { ok: false }
  }
}
