import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import VCard from '../components/VCard'
import { api, fmtEGP, fmtUSD } from '../lib/api'
import { supabase } from '../lib/supabase'

interface PricingResp {
  fx_factor: number
  margin_factor: number
  fixed_fee_egp: number
  tier: 'lite' | 'full'
  require_otp: boolean
  min_card_usd: number
  max_card_usd: number
}

interface Package {
  id: string
  label: string
  youtube_price_egp: number
  card_usd: number
  price_egp: number
  active: boolean
  sort: number
}

type FormStep = 'main' | 'kyc' | 'submitting' | 'done'

export default function Home() {
  const navigate = useNavigate()

  const [pricing, setPricing] = useState<PricingResp | null>(null)
  const [packages, setPackages] = useState<Package[]>([])
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null)

  /* custom calc */
  const [customEgp, setCustomEgp] = useState('')
  const [customResult, setCustomResult] = useState<{ card_usd: number; price_egp: number } | null>(null)
  const [calcLoading, setCalcLoading] = useState(false)
  const [calcTimer, setCalcTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  /* form */
  const [step, setStep] = useState<FormStep>('main')
  const [form, setForm] = useState({
    name_ar: '',
    first_name_en: '',
    last_name_en: '',
    phone: '',
    email: '',
    national_id: '',
    date_of_birth: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiErr, setApiErr] = useState('')

  /* load data */
  useEffect(() => {
    api<PricingResp>('/api/pricing').then(setPricing).catch(console.error)
    fetchPackages()
  }, [])

  async function fetchPackages() {
    const { data } = await supabase
      .from('packages')
      .select('*')
      .eq('active', true)
      .order('sort')
    if (data) setPackages(data as Package[])
  }

  /* debounced custom price calc */
  const calcCustom = useCallback(
    (val: string) => {
      if (calcTimer) clearTimeout(calcTimer)
      if (!val || !pricing) { setCustomResult(null); return }
      const y = parseFloat(val)
      if (isNaN(y) || y < 10 || y > 20000) { setCustomResult(null); return }
      setCalcLoading(true)
      const t = setTimeout(async () => {
        try {
          const r = await api<{ card_usd: number; price_egp: number }>(
            `/api/pricing?youtube_egp=${y}`,
          )
          setCustomResult(r)
        } finally {
          setCalcLoading(false)
        }
      }, 600)
      setCalcTimer(t)
    },
    [pricing, calcTimer],
  )

  function handleCustomChange(v: string) {
    setCustomEgp(v)
    calcCustom(v)
    setSelectedPkg(null)
  }

  /* resolve order params */
  function resolveOrder(): { youtube_egp?: number; package_id?: string } | null {
    if (selectedPkg) return { package_id: selectedPkg }
    const y = parseFloat(customEgp)
    if (!isNaN(y) && y >= 10 && y <= 20000) return { youtube_egp: y }
    return null
  }

  function f(key: keyof typeof form, val: string) {
    setForm(prev => ({ ...prev, [key]: val }))
    setErrors(prev => ({ ...prev, [key]: '' }))
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!form.name_ar.trim()) e.name_ar = 'مطلوب'
    if (!/^[A-Za-z]{2,20}$/.test(form.first_name_en)) e.first_name_en = 'حروف إنجليزية فقط'
    if (!/^[A-Za-z]{2,20}$/.test(form.last_name_en)) e.last_name_en = 'حروف إنجليزية فقط'
    if (!/^01[0125]\d{8}$/.test(form.phone)) e.phone = 'رقم مصري صحيح 01xxxxxxxxx'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'إيميل صحيح'
    if (pricing?.tier === 'full') {
      if (!/^\d{14}$/.test(form.national_id)) e.national_id = 'الرقم القومي 14 رقم'
      if (!form.date_of_birth) e.date_of_birth = 'مطلوب'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    const order = resolveOrder()
    if (!order) { setApiErr('اختار باقة أو أدخل مبلغ صحيح'); return }
    setStep('submitting')
    setApiErr('')
    try {
      const payload = {
        ...order,
        customer_name: form.name_ar,
        first_name_en: form.first_name_en,
        last_name_en: form.last_name_en,
        phone: form.phone,
        email: form.email,
        id_number: form.national_id,
        date_of_birth: form.date_of_birth,
      }
      const res = await api<{ order_code: string; pay_url: string }>('/api/create-order', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      window.location.href = res.pay_url
    } catch (e: unknown) {
      setApiErr(e instanceof Error ? e.message : 'حصل خطأ، حاول تاني')
      setStep('main')
    }
  }

  /* selected amount display */
  const selPkg = packages.find(p => p.id === selectedPkg)
  const displayCardUsd = selPkg?.card_usd ?? customResult?.card_usd
  const displayPriceEgp = selPkg?.price_egp ?? customResult?.price_egp

  return (
    <div className="min-h-screen bg-paper" dir="rtl">
      {/* ─── HERO ─── */}
      <section className="bg-ink text-white py-16 px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, #C79439 0%, transparent 60%)' }} />
        <div className="relative max-w-xl mx-auto">
          <p className="text-gold text-sm font-semibold tracking-widest mb-2">نماء كارد</p>
          <h1 className="text-3xl font-bold mb-3 leading-snug">
            ادفع يوتيوب بيمينتس<br />
            <span className="text-gold">بكارت فيزا مصري</span>
          </h1>
          <p className="text-white/70 text-base mb-8">
            ادفع بكاشير بالجنيه — تستلم فيزا افتراضية جاهزة تدفع بيها فورًا
          </p>
          <div className="flex justify-center">
            <VCard
              status="preview"
              last4="****"
              holderName="AHMED NAMAA"
            />
          </div>
        </div>
      </section>

      {/* ─── STEPS ─── */}
      <section className="py-10 px-4 max-w-2xl mx-auto">
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { n: '١', title: 'اختار المبلغ', desc: 'باقة جاهزة أو أي مبلغ' },
            { n: '٢', title: 'ادفع بكاشير', desc: 'فيزا / ماستر / محافظ' },
            { n: '٣', title: 'استخدم الكارت', desc: 'بيانات الكارت فورًا' },
          ].map(s => (
            <div key={s.n} className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-gold text-ink font-bold text-lg flex items-center justify-center">
                {s.n}
              </div>
              <p className="font-semibold text-ink text-sm">{s.title}</p>
              <p className="text-ink/50 text-xs">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── PACKAGES ─── */}
      <section className="px-4 max-w-2xl mx-auto pb-2">
        <h2 className="text-ink font-bold text-lg mb-4">اختار باقة</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {packages.map(pkg => (
            <button
              key={pkg.id}
              onClick={() => { setSelectedPkg(pkg.id); setCustomEgp(''); setCustomResult(null) }}
              className={`rounded-xl border-2 p-4 text-right transition-all ${
                selectedPkg === pkg.id
                  ? 'border-gold bg-gold/10 shadow-md'
                  : 'border-line bg-white hover:border-gold/50'
              }`}
            >
              <p className="text-ink/60 text-xs mb-1">{pkg.label}</p>
              <p className="text-ink font-bold text-lg">{fmtUSD(pkg.card_usd)}</p>
              <p className="text-gold font-semibold text-sm mt-1">{fmtEGP(pkg.price_egp)}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ─── CUSTOM CALC ─── */}
      <section className="px-4 max-w-2xl mx-auto py-6">
        <div className="bg-white rounded-2xl border border-line p-5">
          <h3 className="text-ink font-semibold mb-3">أو اكتب مبلغ يوتيوب</h3>
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <input
                type="number"
                placeholder="مثال: 150"
                value={customEgp}
                onChange={e => handleCustomChange(e.target.value)}
                className="input w-full pl-12"
                min={10}
                max={20000}
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40 text-sm font-medium">ج.م</span>
            </div>
            {calcLoading && <div className="w-5 h-5 rounded-full border-2 border-gold border-t-transparent animate-spin" />}
          </div>
          {customResult && !calcLoading && (
            <div className="mt-4 flex gap-4 flex-wrap fade-up">
              <div>
                <p className="text-xs text-ink/50">قيمة الكارت</p>
                <p className="font-bold text-ink">{fmtUSD(customResult.card_usd)}</p>
              </div>
              <div>
                <p className="text-xs text-ink/50">ستدفع</p>
                <p className="font-bold text-gold text-lg">{fmtEGP(customResult.price_egp)}</p>
              </div>
              <button
                onClick={() => { setSelectedPkg(null) }}
                className="btn-gold text-xs px-3 py-1 rounded-lg mr-auto"
              >
                استخدم هذا المبلغ ✓
              </button>
            </div>
          )}
          <p className="text-ink/40 text-xs mt-3">
            الحد الأدنى $2 — الحد الأقصى $250 · السعر يشمل رسوم الإصدار وفرق العملة
          </p>
        </div>
      </section>

      {/* ─── FORM ─── */}
      {(selectedPkg || customResult) && (
        <section className="px-4 max-w-2xl mx-auto pb-10 fade-up">
          <div className="bg-white rounded-2xl border border-line p-5 shadow-sm">
            <h3 className="text-ink font-bold text-base mb-1">بيانات الكارت</h3>
            <p className="text-ink/50 text-xs mb-5">
              الاسم الإنجليزي هيتكتب على الكارت — اكتبه صح
            </p>

            {/* summary bar */}
            <div className="bg-ink rounded-xl px-4 py-3 flex justify-between items-center mb-5">
              <span className="text-white/70 text-sm">
                كارت {displayCardUsd ? fmtUSD(displayCardUsd) : ''}
              </span>
              <span className="text-gold font-bold text-lg">
                {displayPriceEgp ? fmtEGP(displayPriceEgp) : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs text-ink/60 mb-1">الاسم بالعربي</label>
                <input className={`input w-full ${errors.name_ar ? 'border-red-400' : ''}`}
                  placeholder="أحمد محمد" value={form.name_ar}
                  onChange={e => f('name_ar', e.target.value)} />
                {errors.name_ar && <p className="text-red-500 text-xs mt-1">{errors.name_ar}</p>}
              </div>
              <div>
                <label className="block text-xs text-ink/60 mb-1">الاسم الأول (إنجليزي)</label>
                <input className={`input w-full uppercase ${errors.first_name_en ? 'border-red-400' : ''}`}
                  placeholder="AHMED" value={form.first_name_en.toUpperCase()}
                  onChange={e => f('first_name_en', e.target.value.toUpperCase())} />
                {errors.first_name_en && <p className="text-red-500 text-xs mt-1">{errors.first_name_en}</p>}
              </div>
              <div>
                <label className="block text-xs text-ink/60 mb-1">اسم العيلة (إنجليزي)</label>
                <input className={`input w-full uppercase ${errors.last_name_en ? 'border-red-400' : ''}`}
                  placeholder="NAMAA" value={form.last_name_en.toUpperCase()}
                  onChange={e => f('last_name_en', e.target.value.toUpperCase())} />
                {errors.last_name_en && <p className="text-red-500 text-xs mt-1">{errors.last_name_en}</p>}
              </div>
              <div>
                <label className="block text-xs text-ink/60 mb-1">واتساب (هيوصلك الكارت عليه)</label>
                <input className={`input w-full ${errors.phone ? 'border-red-400' : ''}`}
                  placeholder="01xxxxxxxxx" value={form.phone} inputMode="tel"
                  onChange={e => f('phone', e.target.value)} />
                {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
              </div>
              <div>
                <label className="block text-xs text-ink/60 mb-1">الإيميل</label>
                <input className={`input w-full ${errors.email ? 'border-red-400' : ''}`}
                  placeholder="you@example.com" value={form.email} inputMode="email" type="email"
                  onChange={e => f('email', e.target.value)} />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>

              {pricing?.tier === 'full' && (
                <>
                  <div className="sm:col-span-2 pt-2 border-t border-line">
                    <p className="text-xs text-gold font-semibold mb-3">بيانات إضافية مطلوبة لهذا المبلغ</p>
                  </div>
                  <div>
                    <label className="block text-xs text-ink/60 mb-1">الرقم القومي (14 رقم)</label>
                    <input className={`input w-full ${errors.national_id ? 'border-red-400' : ''}`}
                      placeholder="2XXXXXXXXXXXXX" value={form.national_id} inputMode="numeric" maxLength={14}
                      onChange={e => f('national_id', e.target.value)} />
                    {errors.national_id && <p className="text-red-500 text-xs mt-1">{errors.national_id}</p>}
                  </div>
                  <div>
                    <label className="block text-xs text-ink/60 mb-1">تاريخ الميلاد</label>
                    <input className={`input w-full ${errors.date_of_birth ? 'border-red-400' : ''}`}
                      type="date" value={form.date_of_birth}
                      onChange={e => f('date_of_birth', e.target.value)} />
                    {errors.date_of_birth && <p className="text-red-500 text-xs mt-1">{errors.date_of_birth}</p>}
                  </div>
                </>
              )}
            </div>

            {apiErr && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm">
                {apiErr}
              </div>
            )}

            <button
              onClick={step === 'submitting' ? undefined : handleSubmit}
              disabled={step === 'submitting'}
              className="btn-gold w-full py-4 rounded-xl text-base font-bold mt-5 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {step === 'submitting' ? (
                <>
                  <span className="w-5 h-5 rounded-full border-2 border-ink border-t-transparent animate-spin" />
                  جاري التحضير...
                </>
              ) : (
                <>
                  💳 ادفع بكاشير دلوقتي
                </>
              )}
            </button>

            <p className="text-center text-ink/40 text-xs mt-3">
              الدفع عبر بوابة كاشير المصرية الآمنة · لا نخزن بيانات كارتك
            </p>
          </div>
        </section>
      )}

      {/* ─── FAQ ─── */}
      <section className="px-4 max-w-2xl mx-auto pb-16">
        <h2 className="text-ink font-bold text-lg mb-5">أسئلة شائعة</h2>
        <div className="space-y-3">
          {[
            {
              q: 'إيه الفرق بين نماء كارد والكروت العادية؟',
              a: 'نماء كارد فيزا افتراضية وان-يوز — بتشحنها بالجنيه المصري وبتستخدمها مرة واحدة بس على يوتيوب.',
            },
            {
              q: 'هتستلم الكارت إمتى؟',
              a: 'فورًا بعد الدفع — بيانات الكارت بتظهر على الشاشة وبتوصلك رسالة واتساب.',
            },
            {
              q: 'الكارت شغال على كل اشتراكات يوتيوب؟',
              a: 'يوتيوب بيمينتس، يوتيوب بريميوم، يوتيوب TV — أي حاجة بتتدفع بكارت دولي.',
            },
            {
              q: 'لو مش استخدمتش الكارت؟',
              a: 'الكارت صالح 72 ساعة من وقت الإصدار. لو عدى الوقت من غير ما تستخدمه، تواصل معنا على واتساب.',
            },
            {
              q: 'في رسوم إضافية؟',
              a: 'السعر اللي هتشوفه شامل كل الرسوم — مفيش مفاجآت.',
            },
          ].map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} />
          ))}
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="bg-ink text-white/50 text-center text-xs py-6 px-4">
        <p className="text-white/80 font-semibold mb-1">نماء كارد — فرص النماء للتنمية المستدامة</p>
        <p>جميع الحقوق محفوظة © {new Date().getFullYear()}</p>
      </footer>
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white rounded-xl border border-line overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center px-4 py-4 text-right text-ink font-medium text-sm"
      >
        {q}
        <span className={`transition-transform text-gold ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="px-4 pb-4 text-ink/60 text-sm leading-relaxed border-t border-line fade-up">
          {a}
        </div>
      )}
    </div>
  )
}
