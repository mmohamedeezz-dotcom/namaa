import { sb, getSettings, logWebhook } from './db.js'
import { encryptJson } from './cryptoBox.js'
import { notify } from './notify.js'
import {
  createLiteCard, createFullCard, getCard, getSecureDetails,
  setCardStatus, terminateCard, normalizeSecure
} from './bitnob.js'

const cardLink = (code: string) => `${process.env.APP_BASE_URL || ''}/card/${code}`

function splitPhone(order: any) {
  let p = String(order.phone || '').replace(/[\s\-()]/g, '')
  const dial = order.dial_code || '+20'
  const bare = dial.replace('+', '')
  if (p.startsWith('+')) p = p.slice(1)
  if (p.startsWith('00')) p = p.slice(2)
  if (p.startsWith(bare)) p = p.slice(bare.length)
  if (p.startsWith('0')) p = p.slice(1)
  return { dial_code: dial, phone_number: p }
}

/** ينشئ الكارت عند Bitnob لو لسه متعملش (idempotent) */
export async function ensureIssued(order: any): Promise<any> {
  const db = sb()
  const { data: existing } = await db.from('cards').select('*').eq('order_id', order.id).maybeSingle()
  if (existing?.bitnob_card_id) return existing
  if (existing?.status === 'failed') return existing

  const settings = await getSettings()
  const tier = settings.card_tier === 'full' ? 'full' : 'lite'
  const { dial_code, phone_number } = splitPhone(order)
  const name = `${order.first_name_en} ${order.last_name_en}`.trim()
  const webhookUrl = `${process.env.APP_BASE_URL || ''}/api/webhooks/bitnob`

  // احجز صف الكارت الأول عشان نمنع الدبل-إصدار لو الويبهوك اتكرر
  let cardRowId = existing?.id
  if (!cardRowId) {
    const { data: inserted, error: insErr } = await db
      .from('cards')
      .insert({ order_id: order.id, tier, status: 'processing', funded_usd: order.card_usd })
      .select('*').single()
    if (insErr) {
      // صف موجود من ريكوست موازي — سيب التاني يكمل
      const { data: again } = await db.from('cards').select('*').eq('order_id', order.id).maybeSingle()
      return again
    }
    cardRowId = inserted.id
  }

  await db.from('orders').update({ status: 'issuing', updated_at: new Date().toISOString() }).eq('id', order.id)

  try {
    let card: any
    if (tier === 'lite') {
      card = await createLiteCard({
        amountUsd: Number(order.card_usd),
        name,
        webhookUrl,
        customer: {
          customer_type: 'individual',
          first_name: order.first_name_en,
          last_name: order.last_name_en,
          email: order.email,
          phone_number,
          dial_code
        }
      })
    } else {
      card = await createFullCard({
        amountUsd: Number(order.card_usd),
        name,
        reference: order.order_code,
        webhookUrl,
        customer: {
          customer_type: 'individual',
          first_name: order.first_name_en,
          last_name: order.last_name_en,
          email: order.email,
          phone_number,
          dial_code,
          date_of_birth: order.date_of_birth,
          id_type: order.id_type || 'national_id',
          id_number: order.id_number,
          line1: order.address_line1 || 'Cairo',
          city: order.city || 'Cairo',
          state: order.state || 'Cairo',
          postal_code: order.postal_code || '11511',
          country: order.country || 'EGY'
        }
      })
    }

    const upd = {
      bitnob_card_id: card?.id || null,
      bitnob_customer_id: card?.customer_id || null,
      card_brand: card?.card_brand || 'visa',
      masked_pan: card?.masked_pan || null,
      last4: card?.last_four_digit || (card?.masked_pan ? String(card.masked_pan).slice(-4) : null),
      status: 'processing',
      updated_at: new Date().toISOString()
    }
    const { data: updated } = await db.from('cards').update(upd).eq('id', cardRowId).select('*').single()
    await logWebhook('bitnob', 'card.create.requested', { order_code: order.order_code, card_id: card?.id })
    return updated
  } catch (e: any) {
    const reason = e?.message || 'bitnob create failed'
    await db.from('cards').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', cardRowId)
    await db.from('orders').update({ status: 'failed', fail_reason: reason, updated_at: new Date().toISOString() }).eq('id', order.id)
    await logWebhook('bitnob', 'card.create.failed', { order_code: order.order_code, error: reason, body: e?.body }, false, reason)
    await notify('issue_failed', {
      order_code: order.order_code, phone: order.phone, customer: order.customer_name,
      amount_egp: order.amount_egp, card_usd: order.card_usd, reason
    })
    return null
  }
}

/** يتابع حالة الكارت عند Bitnob — لو بقى active يسحب البيانات الحساسة ويشفرها ويعلن الجاهزية */
export async function syncCard(order: any, cardRow: any): Promise<any> {
  if (!cardRow?.bitnob_card_id) return cardRow
  if (cardRow.encrypted_details && order.status === 'card_ready') return cardRow
  const db = sb()
  try {
    const remote = await getCard(cardRow.bitnob_card_id)
    const active = remote?.status === 'active' || remote?.created_status === 'completed'
    const patch: any = {
      status: remote?.status === 'terminated' ? 'terminated'
        : remote?.status === 'frozen' ? 'frozen'
        : active ? 'active' : 'processing',
      masked_pan: remote?.masked_pan || cardRow.masked_pan,
      last4: remote?.last_four_digit || (remote?.masked_pan ? String(remote.masked_pan).slice(-4) : cardRow.last4),
      updated_at: new Date().toISOString()
    }
    if (active && !cardRow.encrypted_details) {
      try {
        const secureRaw = await getSecureDetails(cardRow.bitnob_card_id)
        const secure = normalizeSecure(secureRaw)
        if (!secure.billing_address && remote?.billing_address) secure.billing_address = remote.billing_address
        if (!secure.name) secure.name = remote?.name
        patch.encrypted_details = encryptJson(secure)
      } catch (e: any) {
        await logWebhook('bitnob', 'secure.fetch.failed', { card: cardRow.bitnob_card_id, error: e?.message }, false)
      }
    }
    const { data: updated } = await db.from('cards').update(patch).eq('id', cardRow.id).select('*').single()

    if (active && updated?.encrypted_details && order.status !== 'card_ready' && order.status !== 'used') {
      await db.from('orders').update({ status: 'card_ready', updated_at: new Date().toISOString() }).eq('id', order.id)
      await notify('card_ready', {
        order_code: order.order_code,
        phone: order.phone,
        customer: order.customer_name,
        card_usd: order.card_usd,
        last4: updated.last4,
        link: cardLink(order.order_code)
      })
    }
    return updated
  } catch {
    return cardRow
  }
}

/** أول عملية شراء ناجحة = الكارت اتستخدم → تجميد فوري (وان-يوز) */
export async function markUsedAndFreeze(cardRow: any) {
  const db = sb()
  const now = new Date().toISOString()
  if (!cardRow.first_used_at) {
    await db.from('cards').update({ first_used_at: now, updated_at: now }).eq('id', cardRow.id)
    await db.from('orders').update({ status: 'used', updated_at: now }).eq('id', cardRow.order_id)
  }
  try {
    await setCardStatus(cardRow.bitnob_card_id, 'frozen')
    await db.from('cards').update({ status: 'frozen', frozen_at: now, updated_at: now }).eq('id', cardRow.id)
  } catch (e: any) {
    await logWebhook('bitnob', 'freeze.failed', { card: cardRow.bitnob_card_id, error: e?.message }, false)
  }
}

export async function freezeCardRow(cardRow: any) {
  const db = sb()
  const now = new Date().toISOString()
  await setCardStatus(cardRow.bitnob_card_id, 'frozen')
  await db.from('cards').update({ status: 'frozen', frozen_at: now, updated_at: now }).eq('id', cardRow.id)
}

export async function terminateCardRow(cardRow: any, reason: string) {
  const db = sb()
  const now = new Date().toISOString()
  await terminateCard(cardRow.bitnob_card_id, reason)
  await db.from('cards').update({ status: 'terminated', terminated_at: now, updated_at: now }).eq('id', cardRow.id)
}
