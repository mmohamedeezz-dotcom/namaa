import { json, onlyMethod, readBody } from '../_lib/http.js'
import { sb, getSettings } from '../_lib/db.js'
import { sha256, decryptJson } from '../_lib/cryptoBox.js'
import { syncCard } from '../_lib/issuance.js'

export default async function handler(req: any, res: any) {
  if (!onlyMethod(req, res, 'POST')) return
  try {
    const b = await readBody(req)
    const code = String(b.code || '').trim()
    const otp = String(b.otp || '').trim()
    const db = sb()

    const { data: order } = await db.from('orders').select('*').eq('order_code', code).maybeSingle()
    if (!order) return json(res, 404, { error: 'order_not_found' })
    if (!['card_ready', 'used'].includes(order.status)) return json(res, 400, { error: 'الكارت لسه مش جاهز' })

    const s = await getSettings()
    if (s.require_otp) {
      if (!order.otp_hash) return json(res, 400, { error: 'اطلب كود التحقق الأول' })
      if (order.otp_attempts >= 5) return json(res, 429, { error: 'محاولات كتير — اطلب كود جديد' })
      if (!order.otp_expires_at || new Date(order.otp_expires_at) < new Date()) return json(res, 400, { error: 'الكود انتهى — اطلب كود جديد' })
      if (sha256(otp + (process.env.CARD_ENC_KEY || '')) !== order.otp_hash) {
        await db.from('orders').update({ otp_attempts: order.otp_attempts + 1 }).eq('id', order.id)
        return json(res, 400, { error: 'الكود غلط' })
      }
    }

    let { data: card } = await db.from('cards').select('*').eq('order_id', order.id).maybeSingle()
    if (!card) return json(res, 500, { error: 'card_missing' })
    if (!card.encrypted_details) card = await syncCard(order, card)
    if (!card?.encrypted_details) return json(res, 500, { error: 'بيانات الكارت لسه بتتجهز — جرب بعد دقيقة' })

    const details = decryptJson(card.encrypted_details)
    const now = new Date().toISOString()
    await db.from('orders').update({ otp_hash: null, otp_expires_at: null, updated_at: now }).eq('id', order.id)
    await db.from('cards').update({
      view_count: (card.view_count || 0) + 1,
      first_viewed_at: card.first_viewed_at || now,
      updated_at: now
    }).eq('id', card.id)

    json(res, 200, {
      pan: details.pan,
      cvv: details.cvv,
      expiry_month: details.expiry_month,
      expiry_year: details.expiry_year,
      name: details.name || `${order.first_name_en} ${order.last_name_en}`,
      billing_address: details.billing_address || null,
      brand: details.brand || 'visa',
      card_usd: Number(order.card_usd),
      last4: card.last4,
      status: order.status
    })
  } catch (e: any) {
    json(res, 500, { error: e?.message || 'server_error' })
  }
}
