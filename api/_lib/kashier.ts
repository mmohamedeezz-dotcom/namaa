import { hmac256 } from './cryptoBox.js'

const MID = () => process.env.KASHIER_MERCHANT_ID || ''
const APIKEY = () => process.env.KASHIER_API_KEY || ''
const MODE = () => (process.env.KASHIER_MODE === 'live' ? 'live' : 'test')

export function formatAmount(n: number): string {
  return Number(n).toFixed(2)
}

/**
 * صيغة الـ amount للـ hash: بدون كسور عشرية لو المبلغ صحيح.
 * كاشير بتفصل الـ path بالنقطة، فـ "160.00" بتتقري غلط (160 و 00).
 * "160" صحيحة. لو فيه كسور فعلية (159.50) نسيبها بنقطة واحدة.
 */
function hashAmount(n: number): string {
  const num = Number(n)
  return Number.isInteger(num) ? String(num) : String(num)
}

/** رابط صفحة الدفع المستضافة من كاشير (HPP) — حسب التوثيق الرسمي */
export function buildCheckoutUrl(orderCode: string, amountEgp: number, customerName: string) {
  const amountForHash = hashAmount(amountEgp)   // للـ hash: 160
  const amountForUrl = hashAmount(amountEgp)    // للـ URL: نفسها بالظبط عشان يتطابقوا
  const currency = 'EGP'
  const path = `/?payment=${MID()}.${orderCode}.${amountForHash}.${currency}`
  const hash = hmac256(APIKEY(), path)
  const base = process.env.APP_BASE_URL || ''
  const kashierHost = MODE() === 'live'
    ? 'https://iframe.kashier.io'
    : 'https://test-iframe.kashier.io'
  const redirect = `${base}/card/${orderCode}`
  const webhook = `${base}/api/webhooks/kashier`
  const p = new URLSearchParams({
    mid: MID(),
    orderId: orderCode,
    amount: amountForUrl,
    currency,
    hash,
    merchantRedirect: redirect,
    serverWebhook: webhook,
    allowedMethods: process.env.KASHIER_ALLOWED_METHODS || 'card,wallet',
    display: 'ar',
    type: 'external',
    redirectMethod: 'get'
  })
  return `${kashierHost}/payment?${p.toString()}`
}
}

/**
 * التحقق من توقيع ويبهوك كاشير:
 * body = { event, data: { ..., signatureKeys: [...], signature } }
 * بنبني query string من المفاتيح بترتيبها ونعمل HMAC-SHA256 بالـ API key.
 */
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
    // بعض إصدارات كاشير بتوقّع من غير URL-encoding — نجرب الشكلين
    const qsRaw = keys.map((k) => `${k}=${String(data[k] ?? '')}`).join('&')
    const calcRaw = hmac256(APIKEY(), qsRaw)
    if (calcRaw === signature) return { ok: true, note: 'raw-match' }
    return { ok: false, note: 'signature mismatch' }
  } catch (e: any) {
    return { ok: false, note: 'validate error: ' + e?.message }
  }
}
