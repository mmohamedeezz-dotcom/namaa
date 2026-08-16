import { hmac256 } from './cryptoBox.js'

const MID = () => process.env.KASHIER_MERCHANT_ID || ''
const APIKEY = () => process.env.KASHIER_API_KEY || ''
const MODE = () => process.env.KASHIER_MODE || 'test'

export function formatAmount(n: number): string {
  return Number(n).toFixed(2)
}

export function buildCheckoutUrl(orderCode: string, amountEgp: number, _customerName?: string) {
  const amountStr = formatAmount(amountEgp)
  const currency = 'EGP'
  const path = `/?payment=${MID()}.${orderCode}.${amountStr}.${currency}`
  const hash = hmac256(APIKEY(), path)
  const base = process.env.APP_BASE_URL || ''
  const redirectUrl = `${base}/card/${orderCode}`

  const params = new URLSearchParams({
    merchantId: MID(),
    orderId: orderCode,
    amount: amountStr,
    currency,
    hash,
    mode: MODE(),
    merchantRedirect: redirectUrl,
    allowedMethods: 'card,wallet',
    display: 'en',
    redirectMethod: 'get'
  })

  return `https://checkout.kashier.io/?${params.toString()}`
}

export function validateWebhook(body: any): { ok: boolean; note: string } {
  try {
    const data = body?.data || body
    const keys: string[] = data?.signatureKeys
    const signature: string = data?.signature
    if (!Array.isArray(keys) || !signature) return { ok: false, note: 'missing signatureKeys/signature' }
    const qs = keys
      .map((k) => `${k}=${encodeURIComponent(String(data[k] ?? ''))}`)
      .join('&')
    const calc = hmac256(APIKEY(), qs)
    if (calc === signature) return { ok: true, note: 'encoded-match' }
    const qsRaw = keys.map((k) => `${k}=${String(data[k] ?? '')}`).join('&')
    const calcRaw = hmac256(APIKEY(), qsRaw)
    if (calcRaw === signature) return { ok: true, note: 'raw-match' }
    return { ok: false, note: 'signature mismatch' }
  } catch (e: any) {
    return { ok: false, note: 'validate error: ' + e?.message }
  }
}
