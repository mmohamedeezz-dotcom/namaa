import { json, onlyMethod } from './_lib/http.js'
import { sb, getSettings } from './_lib/db.js'
import { ensureIssued, syncCard } from './_lib/issuance.js'
import { buildCheckoutUrl } from './_lib/kashier.js'

export default async function handler(req: any, res: any) {
  if (!onlyMethod(req, res, 'GET')) return
  try {
    const code = String(req.query?.code || '').trim()
    if (!code) return json(res, 400, { error: 'missing code' })
    const db = sb()
    const { data: order } = await db.from('orders').select('*').eq('order_code', code).maybeSingle()
    if (!order) return json(res, 404, { error: 'order_not_found' })

    let { data: card } = await db.from('cards').select('*').eq('order_id', order.id).maybeSingle()

    // محرك التقدّم: الدفع تم؟ اصدر. الكارت لسه بيتجهز؟ زامن.
    if (order.status === 'paid') {
      card = await ensureIssued(order)
      if (card) card = await syncCard(order, card)
    } else if (order.status === 'issuing' && card) {
      card = await syncCard(order, card)
    }

    const { data: fresh } = await db.from('orders').select('*').eq('id', order.id).single()
    const s = await getSettings()

    const expires_at = fresh.paid_at
      ? new Date(new Date(fresh.paid_at).getTime() + Number(s.card_validity_hours) * 3600_000).toISOString()
      : null

    json(res, 200, {
      order_code: fresh.order_code,
      status: fresh.status,
      amount_egp: Number(fresh.amount_egp),
      card_usd: Number(fresh.card_usd),
      customer_name: fresh.customer_name,
      last4: card?.last4 || null,
      masked_pan: card?.masked_pan || null,
      viewed: (card?.view_count || 0) > 0,
      require_otp: !!s.require_otp,
      expires_at,
      support_whatsapp: s.support_whatsapp || '',
      fail_reason: fresh.status === 'failed' ? 'حصلت مشكلة في إصدار الكارت — فلوسك محفوظة وهنتواصل معاك فورًا' : null,
      pay_url: fresh.status === 'pending' ? buildCheckoutUrl(fresh.order_code, Number(fresh.amount_egp), fresh.customer_name) : null
    })
  } catch (e: any) {
    json(res, 500, { error: e?.message || 'server_error' })
  }
}
