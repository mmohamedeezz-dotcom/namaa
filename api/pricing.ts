import { json, onlyMethod } from './_lib/http.js'
import { getSettings } from './_lib/db.js'

/** معاملات التسعير للفرونت (من غير ما نكشف هامشك بالتفصيل) */
export default async function handler(req: any, res: any) {
  if (!onlyMethod(req, res, 'GET')) return
  try {
    const s = await getSettings()
    const c = (1 / Number(s.network_rate_egp)) * (1 + Number(s.fx_buffer_percent) / 100) // card_usd لكل 1 جنيه يوتيوب
    const k = c * Number(s.usd_rate_egp) * (1 + Number(s.margin_percent) / 100)          // سعر البيع لكل 1 جنيه يوتيوب
    json(res, 200, {
      c: Number(c.toFixed(6)),
      k: Number(k.toFixed(6)),
      f: Number(s.fixed_fee_egp),
      min_card_usd: Number(s.min_card_usd),
      max_card_usd: Number(s.max_card_usd),
      require_otp: !!s.require_otp,
      card_validity_hours: Number(s.card_validity_hours),
      support_whatsapp: s.support_whatsapp || '',
      tier: s.card_tier === 'full' ? 'full' : 'lite'
    })
  } catch (e: any) {
    json(res, 500, { error: e?.message || 'server_error' })
  }
}
