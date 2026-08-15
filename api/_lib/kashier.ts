import { hmac256 } from './cryptoBox.js'

const MID = () => process.env.KASHIER_MERCHANT_ID || ''
const APIKEY = () => process.env.KASHIER_API_KEY || ''
const MODE = () => (process.env.KASHIER_MODE === 'live' ? 'live' : 'test')

export function formatAmount(n: number): string {
  return Number(n).toFixed(2)
}

function cleanAmount(n: number): string {
  return String(Number(n))
}

export function buildCheckoutUrl(orderCode: string, amountEgp: number, _customerName?: string) {
  const amount = cleanAmount(amountEgp)
  const currency = 'EGP'
  const path = `/?payment=${MID()}.${orderCode}.${amount}.${currency}`
  const hash = hmac256(APIKEY(), path)
  const base = process.env.APP_BASE_URL || ''
  const kashierHost = MODE() === 'live'
    ? 'https://iframe.kashier.io'
    : 'https://test-iframe.kashier.io'
  const redirect = encodeURIComponent(`${base}/card/${orderCode}`)
  const failRedirect = encodeURIComponent(`${base}/card/${orderCode}`)

  const params = [
    `mid=${MID()}`,
    `orderId=${orderCode}`,
    `amount=${amount}`,
    `currency=${currency}`,
    `hash=${hash}`,
    `merchantRedirect=${redirect}`,
    `failureRedirect=${failRedirect}`,
    `display=en`,
    `mode=${MODE()}`
  ]
  return `${kashierHost}/payment?${params.join('&')}`
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
