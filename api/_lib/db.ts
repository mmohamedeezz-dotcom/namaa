import { createClient } from '@supabase/supabase-js'

let _sb: any = null
export function sb() {
  if (_sb) return _sb
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  _sb = createClient(url, key, { auth: { persistSession: false } })
  return _sb
}

export async function getSettings() {
  const { data, error } = await sb().from('settings').select('*').eq('id', 1).single()
  if (error) throw error
  return data
}

export async function logWebhook(source: string, event: string, payload: any, ok = true, note = '') {
  try { await sb().from('webhook_logs').insert({ source, event, payload, ok, note }) } catch {}
}
