import { json, readBody } from '../_lib/http.js'
import { sb, logWebhook } from '../_lib/db.js'
import { validateWebhook } from '../_lib/kashier.js'
import { ensureIssued, syncCard } from '../_lib/issuance.js'
import { notify } from '../_lib/notify.js'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' })
  const body = await readBody(req)
  const data = body?.data || body || {}
  const code = String(data.merchantOrderId || data.orderId || data.order_id || '').trim()
  const status = String(data.paymentStatus || data.status || '').toUpperCase()

  await logWebhook('kashier', `payment.${status || 'unknown'}`, body)

  try {
    const v = validateWebhook(body)
    if (!v.ok) {
      await logWebhook('kashier', 'signature.invalid', { code, note: v.note }, false, v.note)
      return json(res, 401, { error: 'invalid signature' })
    }

    if (!code) return json(res, 200, { ok: true, note: 'no order code' })
    const db = sb()
    const { data: order } = await db.from('orders').select('*').eq('order_code', code).maybeSingle()
    if (!order) return json(res, 200, { ok: true, note: 'order not found' })

    if (status !== 'SUCCESS') {
      await logWebhook('kashier', 'payment.not_success', { code, status })
      return json(res, 200, { ok: true })
    }

    // تحقق المبلغ
    const paidAmount = Number(data.amount || data.totalAmount || 0)
    if (paidAmount && Math.abs(paidAmount - Number(order.amount_egp)) > 1) {
      await logWebhook('kashier', 'amount.mismatch', { code, paidAmount, expected: order.amount_egp }, false)
      await db.from('orders').update({ status: 'refund_needed', fail_reason: 'مبلغ الدفع مش مطابق', updated_at: new Date().toISOString() }).eq('id', order.id)
      return json(res, 200, { ok: true })
    }

    // idempotency
    if (order.status === 'pending') {
      await db.from('orders').update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        kashier_ref: String(data.transactionId || data.kashierOrderId || data.transactionReference || ''),
        kashier_payload: data,
        updated_at: new Date().toISOString()
      }).eq('id', order.id).eq('status', 'pending')

      await notify('order_paid', { order_code: code, customer: order.customer_name, phone: order.phone, amount_egp: order.amount_egp, card_usd: order.card_usd })

      const fresh = { ...order, status: 'paid' }
      const card = await ensureIssued(fresh)
      if (card) await syncCard(fresh, card)
    }

    json(res, 200, { ok: true })
  } catch (e: any) {
    await logWebhook('kashier', 'handler.error', { error: e?.message }, false, e?.message)
    json(res, 200, { ok: true }) // 200 عشان كاشير ميفضلش يعيد
  }
}
