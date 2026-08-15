import { json, readBody } from '../_lib/http.js'
import { sb, getSettings } from '../_lib/db.js'
import { verifyAdmin } from '../_lib/auth.js'
import { decryptJson } from '../_lib/cryptoBox.js'
import { ensureIssued, syncCard, freezeCardRow, terminateCardRow } from '../_lib/issuance.js'
import { setCardStatus, withdrawFromCard, cardTransactions } from '../_lib/bitnob.js'
import { notify } from '../_lib/notify.js'

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  const adm = await verifyAdmin(req)
  if (!adm.ok) return json(res, 401, { error: 'unauthorized' })

  const action = String(req.query?.action || '')
  const db = sb()
  const b = req.method === 'POST' ? await readBody(req) : {}

  try {
    switch (action) {
      // ---------- لوحة الأرقام ----------
      case 'stats': {
        const { data: orders } = await db.from('orders').select('status, amount_egp, card_usd, created_at')
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const agg: any = { by_status: {}, today_egp: 0, today_count: 0, month_egp: 0, total_count: orders?.length || 0 }
        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
        for (const o of orders || []) {
          agg.by_status[o.status] = (agg.by_status[o.status] || 0) + 1
          const paidish = !['pending', 'cancelled', 'failed'].includes(o.status)
          const t = new Date(o.created_at)
          if (paidish && t >= today) { agg.today_egp += Number(o.amount_egp); agg.today_count++ }
          if (paidish && t >= monthStart) agg.month_egp += Number(o.amount_egp)
        }
        return json(res, 200, agg)
      }

      // ---------- الطلبات ----------
      case 'orders': {
        const status = String(req.query?.status || '')
        const q = String(req.query?.q || '').trim()
        const limit = Math.min(Number(req.query?.limit || 50), 200)
        let query = db.from('orders')
          .select('*, cards(id, bitnob_card_id, status, last4, masked_pan, view_count, first_used_at, tier)')
          .order('created_at', { ascending: false }).limit(limit)
        if (status) query = query.eq('status', status)
        if (q) query = query.or(`order_code.ilike.%${q}%,phone.ilike.%${q}%,customer_name.ilike.%${q}%,email.ilike.%${q}%`)
        const { data, error } = await query
        if (error) return json(res, 500, { error: error.message })
        return json(res, 200, { orders: data })
      }

      case 'order': {
        const code = String(req.query?.code || '')
        const { data: order } = await db.from('orders').select('*, cards(*)').eq('order_code', code).maybeSingle()
        if (!order) return json(res, 404, { error: 'not_found' })
        if (order.cards) {
          delete order.cards.encrypted_details
        }
        delete order.otp_hash
        return json(res, 200, { order })
      }

      // ---------- إجراءات الكارت ----------
      case 'retry': {
        const { data: order } = await db.from('orders').select('*').eq('order_code', b.code).maybeSingle()
        if (!order) return json(res, 404, { error: 'not_found' })
        const { data: cardRow } = await db.from('cards').select('*').eq('order_id', order.id).maybeSingle()
        if (cardRow && !cardRow.bitnob_card_id) await db.from('cards').delete().eq('id', cardRow.id)
        if (['failed', 'issuing'].includes(order.status)) {
          await db.from('orders').update({ status: 'paid', fail_reason: null, updated_at: new Date().toISOString() }).eq('id', order.id)
        }
        const fresh = { ...order, status: 'paid' }
        const card = await ensureIssued(fresh)
        if (card?.bitnob_card_id) await syncCard(fresh, card)
        return json(res, 200, { ok: true })
      }

      case 'sync': {
        const { data: order } = await db.from('orders').select('*, cards(*)').eq('order_code', b.code).maybeSingle()
        if (!order?.cards) return json(res, 404, { error: 'no_card' })
        await syncCard(order, order.cards)
        return json(res, 200, { ok: true })
      }

      case 'freeze': case 'activate': {
        const { data: card } = await db.from('cards').select('*').eq('order_id',
          (await db.from('orders').select('id').eq('order_code', b.code).single()).data?.id).maybeSingle()
        if (!card?.bitnob_card_id) return json(res, 404, { error: 'no_card' })
        if (action === 'freeze') await freezeCardRow(card)
        else {
          await setCardStatus(card.bitnob_card_id, 'active')
          await db.from('cards').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', card.id)
        }
        return json(res, 200, { ok: true })
      }

      case 'terminate': {
        const { data: o } = await db.from('orders').select('id').eq('order_code', b.code).single()
        const { data: card } = await db.from('cards').select('*').eq('order_id', o?.id).maybeSingle()
        if (!card?.bitnob_card_id) return json(res, 404, { error: 'no_card' })
        await terminateCardRow(card, b.reason || 'admin terminate')
        return json(res, 200, { ok: true })
      }

      case 'withdraw': {
        const { data: o } = await db.from('orders').select('id, order_code').eq('order_code', b.code).single()
        const { data: card } = await db.from('cards').select('*').eq('order_id', o?.id).maybeSingle()
        if (!card?.bitnob_card_id) return json(res, 404, { error: 'no_card' })
        const r = await withdrawFromCard(card.bitnob_card_id, Number(b.amount_usd), `WD-${o.order_code}-${Date.now()}`)
        return json(res, 200, { ok: true, result: r })
      }

      case 'reveal': {
        const { data: o } = await db.from('orders').select('id').eq('order_code', b.code).single()
        const { data: card } = await db.from('cards').select('*').eq('order_id', o?.id).maybeSingle()
        if (!card?.encrypted_details) return json(res, 404, { error: 'no_details' })
        return json(res, 200, { details: decryptJson(card.encrypted_details) })
      }

      case 'transactions': {
        const { data: o } = await db.from('orders').select('id').eq('order_code', b.code).single()
        const { data: card } = await db.from('cards').select('*').eq('order_id', o?.id).maybeSingle()
        if (!card?.bitnob_card_id) return json(res, 404, { error: 'no_card' })
        const tx = await cardTransactions(card.bitnob_card_id)
        return json(res, 200, { transactions: tx })
      }

      case 'refund': {
        await db.from('orders').update({ status: 'refund_needed', fail_reason: b.note || 'استرداد يدوي', updated_at: new Date().toISOString() }).eq('order_code', b.code)
        return json(res, 200, { ok: true })
      }

      case 'resend': {
        const { data: order } = await db.from('orders').select('*, cards(last4)').eq('order_code', b.code).maybeSingle()
        if (!order) return json(res, 404, { error: 'not_found' })
        await notify('card_ready', {
          order_code: order.order_code, phone: order.phone, customer: order.customer_name,
          card_usd: order.card_usd, last4: order.cards?.last4,
          link: `${process.env.APP_BASE_URL || ''}/card/${order.order_code}`
        })
        return json(res, 200, { ok: true })
      }

      // ---------- الإعدادات والباقات ----------
      case 'settings-get': {
        const s = await getSettings()
        return json(res, 200, { settings: s })
      }
      case 'settings-save': {
        const allowed = ['usd_rate_egp','network_rate_egp','margin_percent','fixed_fee_egp','fx_buffer_percent','min_card_usd','max_card_usd','card_tier','require_otp','card_validity_hours','support_whatsapp']
        const patch: any = { updated_at: new Date().toISOString() }
        for (const k of allowed) if (b[k] !== undefined) patch[k] = b[k]
        const { error } = await db.from('settings').update(patch).eq('id', 1)
        if (error) return json(res, 500, { error: error.message })
        return json(res, 200, { ok: true })
      }

      case 'packages-all': {
        const { data } = await db.from('packages').select('*').order('sort')
        return json(res, 200, { packages: data })
      }
      case 'packages-save': {
        const row: any = {
          label: b.label, description: b.description || '',
          youtube_price_egp: b.youtube_price_egp || null,
          card_usd: Number(b.card_usd), price_egp: Number(b.price_egp),
          active: b.active !== false, sort: Number(b.sort || 0)
        }
        if (b.id) {
          const { error } = await db.from('packages').update(row).eq('id', b.id)
          if (error) return json(res, 500, { error: error.message })
        } else {
          const { error } = await db.from('packages').insert(row)
          if (error) return json(res, 500, { error: error.message })
        }
        return json(res, 200, { ok: true })
      }
      case 'packages-delete': {
        await db.from('packages').delete().eq('id', b.id)
        return json(res, 200, { ok: true })
      }

      case 'logs': {
        const { data } = await db.from('webhook_logs').select('*').order('created_at', { ascending: false }).limit(60)
        return json(res, 200, { logs: data })
      }

      default:
        return json(res, 404, { error: 'unknown_action' })
    }
  } catch (e: any) {
    return json(res, 500, { error: e?.message || 'server_error' })
  }
}
