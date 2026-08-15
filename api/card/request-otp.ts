import { json, onlyMethod, readBody } from '../_lib/http.js'
import { sb, getSettings } from '../_lib/db.js'
import { sha256, randomOtp } from '../_lib/cryptoBox.js'
import { notify } from '../_lib/notify.js'

export default async function handler(req: any, res: any) {
  if (!onlyMethod(req, res, 'POST')) return
  try {
    const b = await readBody(req)
    const code = String(b.code || '').trim()
    const phone = String(b.phone || '').replace(/[\s\-()]/g, '')
    const db = sb()
    const { data: order } = await db.from('orders').select('*').eq('order_code', code).maybeSingle()
    if (!order) return json(res, 404, { error: 'order_not_found' })
    if (!['card_ready', 'used'].includes(order.status)) return json(res, 400, { error: 'الكارت لسه مش جاهز' })

    const s = await getSettings()
    if (!s.require_otp) return json(res, 200, { skip: true })

    // مطابقة آخر 9 أرقام من الموبايل
    const tail = (x: string) => x.replace(/^\+?2?0?/, '').slice(-9)
    if (tail(phone) !== tail(order.phone)) return json(res, 400, { error: 'رقم الموبايل مش مطابق للطلب' })

    const otp = randomOtp()
    await db.from('orders').update({
      otp_hash: sha256(otp + (process.env.CARD_ENC_KEY || '')),
      otp_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      otp_attempts: 0,
      updated_at: new Date().toISOString()
    }).eq('id', order.id)

    const sent = await notify('otp', { phone: order.phone, otp, order_code: order.order_code, customer: order.customer_name })
    if (!sent.sent) return json(res, 500, { error: 'قناة إرسال الكود مش متظبطة — كلم الدعم', detail: sent })
    json(res, 200, { sent: true })
  } catch (e: any) {
    json(res, 500, { error: e?.message || 'server_error' })
  }
}
