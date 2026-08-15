import { json, readBody } from '../_lib/http.js'
import { sb, logWebhook } from '../_lib/db.js'
import { syncCard, markUsedAndFreeze } from '../_lib/issuance.js'

/** ويبهوك Bitnob لكل كارت — بيتبعت للـ URL اللي حددناه وقت الإنشاء */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' })
  const body = await readBody(req)
  const event = String(body?.event || body?.type || '').toLowerCase()
  const data = body?.data || body || {}

  await logWebhook('bitnob', event || 'unknown', body)

  try {
    const cardId = String(
      data.card_id || data.cardId || data?.card?.id || (event.includes('card') ? data.id : '') || ''
    ).trim()
    if (!cardId) return json(res, 200, { ok: true, note: 'no card id' })

    const db = sb()
    const { data: cardRow } = await db.from('cards').select('*').eq('bitnob_card_id', cardId).maybeSingle()
    if (!cardRow) return json(res, 200, { ok: true, note: 'card not ours' })
    const { data: order } = await db.from('orders').select('*').eq('id', cardRow.order_id).single()

    const t = String(data.transaction_type || data.type || '').toLowerCase()
    const isFunding = t.includes('fund') || t.includes('topup') || event.includes('topup') || event.includes('created')
    const isSpend =
      !isFunding &&
      (t.includes('debit') || t.includes('authorization') || t.includes('settle') ||
        event.includes('transaction') || event.includes('debit') || event.includes('cross_border'))

    if (isSpend) {
      await markUsedAndFreeze(cardRow)
      await logWebhook('bitnob', 'card.used.frozen', { order_code: order.order_code, card: cardId })
    } else {
      await syncCard(order, cardRow)
    }
    json(res, 200, { ok: true })
  } catch (e: any) {
    await logWebhook('bitnob', 'handler.error', { error: e?.message }, false, e?.message)
    json(res, 200, { ok: true })
  }
}
