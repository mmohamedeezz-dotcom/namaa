/**
 * Bitnob Cards API v2 adapter
 * المرجع: bitnob.dev/api-reference/virtual-cards
 * - كل المبالغ micro-units: 1 دولار = 1,000,000
 * - الإصدار غير متزامن: الكارت بيبدأ pending/processing لحد ما يبقى active
 */
const BASE = () => (process.env.BITNOB_BASE_URL || 'https://api.bitnob.co').replace(/\/$/, '')
const KEY = () => process.env.BITNOB_SECRET_KEY || ''

export const usdToMicro = (usd: number) => Math.round(Number(usd) * 1_000_000)
export const microToUsd = (m: any) => Number(m || 0) / 1_000_000

async function bfetch(path: string, init: RequestInit = {}) {
  const r = await fetch(`${BASE()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY()}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  })
  let body: any = null
  try { body = await r.json() } catch { body = { raw: await r.text().catch(() => '') } }
  if (!r.ok || body?.success === false) {
    const msg = body?.message || body?.error || `bitnob http ${r.status}`
    const err: any = new Error(msg)
    err.status = r.status
    err.body = body
    throw err
  }
  return body
}

export type LiteCustomer = {
  customer_type: 'individual'
  first_name: string
  last_name: string
  email: string
  phone_number: string
  dial_code: string
}

export type FullCustomer = LiteCustomer & {
  date_of_birth: string
  id_type: string
  id_number: string
  line1: string
  city: string
  state: string
  postal_code: string
  country: string // ISO alpha-3 مثل EGY
}

/** إنشاء Lite Card — بيانات اتصال بسيطة، حد أقصى $250، مفيهاش شحن إضافي بعد الإنشاء */
export async function createLiteCard(p: {
  amountUsd: number
  name: string
  customer: LiteCustomer
  webhookUrl?: string
}) {
  const body: any = {
    type: 'lite',
    amount: usdToMicro(p.amountUsd),
    currency: 'USD',
    name: p.name,
    customer: p.customer
  }
  if (p.webhookUrl) body.webhook_url = p.webhookUrl
  const res = await bfetch('/api/cards/lite', { method: 'POST', body: JSON.stringify(body) })
  return res?.data?.card || res?.data || res
}

/** إنشاء كارت كامل — KYC كامل (هوية + عنوان + تاريخ ميلاد) */
export async function createFullCard(p: {
  amountUsd: number
  name: string
  reference: string
  customer: FullCustomer
  webhookUrl?: string
}) {
  const body: any = {
    amount: usdToMicro(p.amountUsd),
    card_type: 'virtual',
    card_brand: 'visa',
    currency: 'USD',
    name: p.name,
    reference: p.reference,
    customer: p.customer
  }
  if (p.webhookUrl) body.webhook_url = p.webhookUrl
  const res = await bfetch('/api/cards', { method: 'POST', body: JSON.stringify(body) })
  return res?.data?.card || res?.data || res
}

export async function getCard(cardId: string) {
  const res = await bfetch(`/api/cards/${cardId}`)
  return res?.data?.card || res?.data || res
}

/** البيانات الحساسة (رقم كامل + CVV) */
export async function getSecureDetails(cardId: string) {
  const res = await bfetch(`/api/cards/${cardId}/secure`)
  return res?.data?.card || res?.data || res
}

export async function setCardStatus(cardId: string, status: 'frozen' | 'active') {
  const res = await bfetch(`/api/cards/${cardId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status })
  })
  return res?.data?.card || res?.data || res
}

export async function terminateCard(cardId: string, reason: string) {
  const res = await bfetch(`/api/cards/${cardId}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason })
  })
  return res?.data || res
}

export async function withdrawFromCard(cardId: string, amountUsd: number, reference: string) {
  const res = await bfetch(`/api/cards/${cardId}/balance`, {
    method: 'POST',
    body: JSON.stringify({ amount: usdToMicro(amountUsd), type: 'withdraw', reference })
  })
  return res?.data || res
}

export async function cardTransactions(cardId: string) {
  const res = await bfetch(`/api/cards/${cardId}/transactions`)
  return res?.data || res
}

/** توحيد شكل البيانات الحساسة مهما اختلفت أسماء الحقول */
export function normalizeSecure(raw: any) {
  const g = (...keys: string[]) => {
    for (const k of keys) {
      const v = k.split('.').reduce((o: any, kk) => (o ? o[kk] : undefined), raw)
      if (v !== undefined && v !== null && v !== '') return v
    }
    return null
  }
  let expM = g('expiry_month', 'exp_month', 'expiryMonth')
  let expY = g('expiry_year', 'exp_year', 'expiryYear')
  const expiry = g('expiry', 'expiry_date', 'expiration', 'valid_thru')
  if ((!expM || !expY) && typeof expiry === 'string' && expiry.includes('/')) {
    const [m, y] = expiry.split('/')
    expM = expM || m
    expY = expY || y
  }
  return {
    pan: g('card_number', 'pan', 'cardNumber', 'number'),
    cvv: g('cvv', 'cvv2', 'security_code', 'securityCode'),
    expiry_month: expM ? String(expM).padStart(2, '0') : null,
    expiry_year: expY ? String(expY) : null,
    name: g('name', 'cardholder_name', 'card_holder', 'preferred_name'),
    masked_pan: g('masked_pan'),
    billing_address: g('billing_address', 'billingAddress'),
    brand: g('card_brand', 'brand') || 'visa',
    _raw: raw
  }
}
