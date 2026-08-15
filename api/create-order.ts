import { json, onlyMethod, readBody } from './_lib/http.js'
import { sb, getSettings } from './_lib/db.js'
import { randomCode } from './_lib/cryptoBox.js'
import { buildCheckoutUrl } from './_lib/kashier.js'
import { quoteFromYoutubeEgp, priceEgpForCardUsd } from './_lib/pricing.js'

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '')
const enOk = (s: string) => /^[A-Za-z][A-Za-z\s'.-]{1,29}$/.test((s || '').trim())

export default async function handler(req: any, res: any) {
  if (!onlyMethod(req, res, 'POST')) return
  try {
    const b = await readBody(req)
    const db = sb()

    // إعادة توليد رابط الدفع لطلب pending موجود
    if (b.retry_code) {
      const { data: o } = await db.from('orders').select('*').eq('order_code', b.retry_code).maybeSingle()
      if (!o) return json(res, 404, { error: 'order_not_found' })
      if (o.status !== 'pending') return json(res, 400, { error: 'order_not_pending' })
      return json(res, 200, { order_code: o.order_code, pay_url: buildCheckoutUrl(o.order_code, Number(o.amount_egp), o.customer_name) })
    }

    const s = await getSettings()
    const tier = s.card_tier === 'full' ? 'full' : 'lite'

    const customer_name = String(b.customer_name || '').trim()
    const first = String(b.first_name_en || '').trim()
    const last = String(b.last_name_en || '').trim()
    const phone = String(b.phone || '').replace(/[\s\-()]/g, '')
    const email = String(b.email || '').trim().toLowerCase()

    if (customer_name.length < 3) return json(res, 400, { error: 'اكتب اسمك' })
    if (!enOk(first) || !enOk(last)) return json(res, 400, { error: 'الاسم بالإنجليزي (أول واسم العيلة) مطلوب بحروف إنجليزية' })
    if (!/^(\+?2?0?1[0125][0-9]{8})$/.test(phone)) return json(res, 400, { error: 'رقم الموبايل المصري غير صحيح' })
    if (!emailOk(email)) return json(res, 400, { error: 'الإيميل غير صحيح' })

    // تحديد المبالغ — من باقة أو مبلغ مخصص، ودايمًا محسوبة سيرفر-سايد
    let card_usd = 0
    let amount_egp = 0
    let package_id: string | null = null

    if (b.package_id) {
      const { data: pkg } = await db.from('packages').select('*').eq('id', b.package_id).eq('active', true).maybeSingle()
      if (!pkg) return json(res, 400, { error: 'الباقة غير متاحة' })
      package_id = pkg.id
      card_usd = Number(pkg.card_usd)
      amount_egp = Number(pkg.price_egp)
    } else {
      const youtube_egp = Number(b.youtube_egp || 0)
      if (!youtube_egp || youtube_egp < 10 || youtube_egp > 20000) return json(res, 400, { error: 'اكتب المبلغ اللي هيتخصم على يوتيوب (10 جنيه على الأقل)' })
      const q = quoteFromYoutubeEgp(youtube_egp, s)
      card_usd = q.card_usd
      amount_egp = q.price_egp
    }

    if (card_usd < Number(s.min_card_usd)) card_usd = Number(s.min_card_usd)
    if (card_usd > Number(s.max_card_usd)) return json(res, 400, { error: `أقصى قيمة للكارت $${s.max_card_usd} — كلم الدعم للمبالغ الأكبر` })
    if (!amount_egp || amount_egp < 1) amount_egp = priceEgpForCardUsd(card_usd, s)

    const row: any = {
      order_code: randomCode(),
      package_id,
      customer_name,
      first_name_en: first,
      last_name_en: last,
      phone,
      dial_code: '+20',
      email,
      amount_egp,
      card_usd,
      status: 'pending',
      country: 'EGY'
    }

    if (tier === 'full') {
      const id_number = String(b.id_number || '').trim()
      const dob = String(b.date_of_birth || '').trim()
      if (!/^\d{14}$/.test(id_number)) return json(res, 400, { error: 'الرقم القومي 14 رقم مطلوب' })
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return json(res, 400, { error: 'تاريخ الميلاد مطلوب' })
      row.id_type = 'national_id'
      row.id_number = id_number
      row.date_of_birth = dob
      row.address_line1 = String(b.address_line1 || 'Cairo').trim()
      row.city = String(b.city || 'Cairo').trim()
      row.state = String(b.state || 'Cairo').trim()
      row.postal_code = String(b.postal_code || '11511').trim()
    }

    const { data: order, error } = await db.from('orders').insert(row).select('*').single()
    if (error) return json(res, 500, { error: 'تعذر إنشاء الطلب: ' + error.message })

    json(res, 200, {
      order_code: order.order_code,
      amount_egp,
      card_usd,
      pay_url: buildCheckoutUrl(order.order_code, amount_egp, customer_name)
    })
  } catch (e: any) {
    json(res, 500, { error: e?.message || 'server_error' })
  }
}
