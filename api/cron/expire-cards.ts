import { json } from '../_lib/http.js'
import { sb, getSettings, logWebhook } from '../_lib/db.js'
import { ensureIssued, syncCard, freezeCardRow, terminateCardRow } from '../_lib/issuance.js'

/**
 * كرون كل ساعة:
 * 1) طلبات pending أقدم من 24 ساعة → cancelled
 * 2) طلبات paid/issuing → إعادة محاولة الإصدار/المزامنة
 * 3) كروت active عدّت صلاحيتها → freeze (+ order = expired لو ما اتستخدمش)
 * 4) كروت frozen عدّى عليها 25 ساعة من الإنشاء → terminate (الرصيد المتبقي يرجع لمحفظتك)
 */
export default async function handler(req: any, res: any) {
  const secret = process.env.CRON_SECRET || ''
  const auth = String(req.headers['authorization'] || '')
  const q = String(req.query?.secret || '')
  if (secret && auth !== `Bearer ${secret}` && q !== secret) return json(res, 401, { error: 'unauthorized' })

  const db = sb()
  const s = await getSettings()
  const now = Date.now()
  const out: any = { cancelled: 0, retried: 0, frozen: 0, terminated: 0 }

  try {
    // 1) إلغاء المعلّق القديم
    const dayAgo = new Date(now - 24 * 3600_000).toISOString()
    const { data: stale } = await db.from('orders').select('id').eq('status', 'pending').lt('created_at', dayAgo)
    if (stale?.length) {
      await db.from('orders').update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .in('id', stale.map((x: any) => x.id))
      out.cancelled = stale.length
    }

    // 2) إعادة محاولة الإصدار
    const { data: retry } = await db.from('orders').select('*').in('status', ['paid', 'issuing']).limit(10)
    for (const order of retry || []) {
      const card = await ensureIssued(order)
      if (card) await syncCard(order, card)
      out.retried++
    }

    // 3) تجميد المنتهي
    const { data: activeCards } = await db.from('cards').select('*, orders!inner(paid_at, status, order_code)').eq('status', 'active').limit(50)
    for (const c of activeCards || []) {
      const paidAt = c.orders?.paid_at ? new Date(c.orders.paid_at).getTime() : new Date(c.created_at).getTime()
      if (now > paidAt + Number(s.card_validity_hours) * 3600_000) {
        try {
          await freezeCardRow(c)
          if (c.orders?.status === 'card_ready') {
            await db.from('orders').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', c.order_id)
          }
          out.frozen++
        } catch (e: any) { await logWebhook('bitnob', 'cron.freeze.failed', { card: c.bitnob_card_id, error: e?.message }, false) }
      }
    }

    // 4) إنهاء المجمّد بعد فترة التبريد (24 ساعة من الإنشاء)
    const coolAgo = new Date(now - 25 * 3600_000).toISOString()
    const { data: frozenCards } = await db.from('cards').select('*').eq('status', 'frozen').lt('created_at', coolAgo).limit(25)
    for (const c of frozenCards || []) {
      try { await terminateCardRow(c, 'one-use lifecycle complete'); out.terminated++ }
      catch (e: any) { await logWebhook('bitnob', 'cron.terminate.failed', { card: c.bitnob_card_id, error: e?.message }, false) }
    }

    await logWebhook('n8n', 'cron.run', out)
    json(res, 200, { ok: true, ...out })
  } catch (e: any) {
    json(res, 500, { error: e?.message })
  }
}
