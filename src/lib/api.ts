import { supabase } from './supabase'

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body?.error || 'حصلت مشكلة — جرب تاني')
  return body as T
}

/** Admin API — يمرر token تلقائياً من Supabase session */
export async function adminApi<T = unknown>(
  tokenOrPath: string,
  pathOrOpts: string | RequestInit = {},
  opts: RequestInit = {},
): Promise<T> {
  // Overload 1: adminApi(token, path, opts?)
  // Overload 2: adminApi(path, opts?)  → token من session
  let token: string
  let path: string
  let fetchOpts: RequestInit

  if (typeof pathOrOpts === 'string') {
    token = tokenOrPath
    path = pathOrOpts
    fetchOpts = opts
  } else {
    const { data } = await supabase.auth.getSession()
    token = data.session?.access_token ?? ''
    path = tokenOrPath
    fetchOpts = pathOrOpts
  }
  if (!token) throw new Error('سجّل دخولك الأول')
  const r = await fetch(path, {
    ...fetchOpts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(fetchOpts.headers || {}),
    },
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body?.error || 'حصلت مشكلة')
  return body as T
}

export const fmtEGP = (n: number | string) =>
  `${Number(n || 0).toLocaleString('ar-EG')} ج.م`

export const fmtUSD = (n: number | string) =>
  `$${Number(n || 0).toFixed(2)}`

/** legacy aliases */
export const egp = fmtEGP
export const usd = fmtUSD
