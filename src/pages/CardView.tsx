import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import VCard from '../components/VCard'
import { api, fmtEGP, fmtUSD } from '../lib/api'

type OrderStatus =
  | 'pending' | 'paid' | 'issuing' | 'card_ready'
  | 'used' | 'expired' | 'failed' | 'refund_needed' | 'cancelled'

interface StatusResp {
  status: OrderStatus
  last4?: string
  expires_at?: string
  pay_url?: string
  card_usd?: number
  price_egp?: number
  holder?: string
}

interface CardDetails {
  pan: string
  cvv: string
  expiry: string
  billing_address?: string
  holder: string
}

type ViewStep = 'locked' | 'otp_input' | 'otp_loading' | 'revealed' | 'error'

const SUPPORT_WA = import.meta.env.VITE_SUPPORT_WA || '201000000000'

export default function CardView() {
  const { code } = useParams<{ code: string }>()
  const [params] = useSearchParams()
  const paymentStatus = params.get('paymentStatus') // from Kashier redirect

  const [status, setStatus] = useState<StatusResp | null>(null)
  const [loading, setLoading] = useState(true)

  /* OTP flow */
  const [viewStep, setViewStep] = useState<ViewStep>('locked')
  const [phone, setPhone] = useState('')
  const [phoneErr, setPhoneErr] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [otpErr, setOtpErr] = useState('')
  const [cardDetails, setCardDetails] = useState<CardDetails | null>(null)

  /* copied state */
  const [copied, setCopied] = useState<string | null>(null)

  /* countdown */
  const [remaining, setRemaining] = useState<number | null>(null)
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* polling for issuing */
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!code) return
    try {
     const psQuery = paymentStatus ? `&paymentStatus=${encodeURIComponent(paymentStatus)}` : ''
      const r = await api<StatusResp>(`/api/order-status?code=${code}${psQuery}`)
      setStatus(r)
      return r
    } catch {
      return null
    } finally {
      setLoading(false)
    }
  }, [code])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  /* poll when issuing */
  useEffect(() => {
    if (!status) return
    if (status.status === 'issuing' || status.status === 'paid') {
      if (!pollRef.current) {
        pollRef.current = setInterval(async () => {
          const r = await fetchStatus()
          if (r && r.status !== 'issuing' && r.status !== 'paid') {
            clearInterval(pollRef.current!)
            pollRef.current = null
          }
        }, 3500)
      }
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [status?.status, fetchStatus])

  /* countdown timer */
  useEffect(() => {
    if (!status?.expires_at) return
    const calc = () => {
      const diff = Math.floor((new Date(status.expires_at!).getTime() - Date.now()) / 1000)
      setRemaining(diff > 0 ? diff : 0)
    }
    calc()
    countRef.current = setInterval(calc, 1000)
    return () => { if (countRef.current) clearInterval(countRef.current) }
  }, [status?.expires_at])

  function fmtCountdown(s: number) {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  async function requestOtp() {
    if (!/^01[0125]\d{8}$/.test(phone)) {
      setPhoneErr('رقم مصري صحيح 01xxxxxxxxx')
      return
    }
    setPhoneErr('')
    setViewStep('otp_loading')
    try {
      await api(`/api/card/request-otp`, {
        method: 'POST',
        body: JSON.stringify({ order_code: code, phone_last9: phone.slice(-9) }),
      })
      setOtpSent(true)
      setViewStep('otp_input')
    } catch (e: unknown) {
      setOtpErr(e instanceof Error ? e.message : 'تعذر إرسال الكود')
      setViewStep('locked')
    }
  }

  function handleOtpKey(i: number, val: string) {
    if (!/^\d?$/.test(val)) return
    const next = [...otp]
    next[i] = val
    setOtp(next)
    if (val && i < 5) {
      document.getElementById(`otp-${i + 1}`)?.focus()
    }
    if (next.every(d => d) && val) {
      verifyOtp(next.join(''))
    }
  }

  async function verifyOtp(code6?: string) {
    const pin = code6 ?? otp.join('')
    if (pin.length < 6) return
    setViewStep('otp_loading')
    try {
      const r = await api<CardDetails>('/api/card/view', {
        method: 'POST',
        body: JSON.stringify({ order_code: code, otp: pin }),
      })
      setCardDetails(r)
      setViewStep('revealed')
    } catch (e: unknown) {
      setOtpErr(e instanceof Error ? e.message : 'الكود غلط')
      setViewStep('otp_input')
      setOtp(['', '', '', '', '', ''])
    }
  }

  function copyText(val: string, label: string) {
    navigator.clipboard.writeText(val).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-gold border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-ink/50 text-sm">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  /* ── PENDING (payment redirect failed or not yet paid) ── */
  if (!status || status.status === 'pending') {
    return (
      <Page title="إكمال الدفع">
        <div className="text-center py-8">
          <div className="text-5xl mb-4">💳</div>
          {paymentStatus && paymentStatus !== 'SUCCESS' && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6 text-red-600 text-sm">
              لم يتم إتمام الدفع — يمكنك المحاولة مجددًا
            </div>
          )}
          <p className="text-ink/60 text-sm mb-6">الطلب لم يُدفع بعد</p>
          {status?.pay_url && (
            <a href={status.pay_url} className="btn-gold px-8 py-3 rounded-xl inline-block font-bold">
              ادفع دلوقتي
            </a>
          )}
        </div>
      </Page>
    )
  }

  /* ── ISSUING (polling) ── */
  if (status.status === 'issuing' || status.status === 'paid') {
    return (
      <Page title="جاري إصدار الكارت">
        <div className="text-center py-8">
          <div className="relative w-24 mx-auto mb-6">
            <VCard status="processing" last4="..." holderName="..." size="sm" />
            <div className="absolute inset-0 rounded-2xl border-2 border-gold animate-ping opacity-30 pointer-events-none" />
          </div>
          <p className="text-ink font-semibold mb-2">جاري إصدار الفيزا...</p>
          <p className="text-ink/50 text-sm mb-2">ده بياخد من ثانية لدقيقتين</p>
          <p className="text-ink/40 text-xs">الصفحة بتتحدث تلقائيًا — متحتاجش تضغط حاجة</p>
        </div>
      </Page>
    )
  }

  /* ── TERMINAL STATES ── */
  if (['used', 'expired', 'failed', 'refund_needed', 'cancelled'].includes(status.status)) {
    const msgs: Record<string, { icon: string; title: string; desc: string }> = {
      used:          { icon: '✅', title: 'تم استخدام الكارت', desc: 'الكارت اتستخدم بنجاح' },
      expired:       { icon: '⏰', title: 'انتهت صلاحية الكارت', desc: 'مر أكثر من 72 ساعة بدون استخدام' },
      failed:        { icon: '❌', title: 'فشل إصدار الكارت', desc: 'حصلت مشكلة تقنية — تواصل معنا' },
      refund_needed: { icon: '🔄', title: 'جاري المراجعة', desc: 'سيتم استرداد المبلغ خلال 3-5 أيام' },
      cancelled:     { icon: '🚫', title: 'تم إلغاء الطلب', desc: 'الطلب ده اتلغى' },
    }
    const m = msgs[status.status] || msgs.failed
    return (
      <Page title={m.title}>
        <div className="text-center py-8">
          <div className="text-5xl mb-4">{m.icon}</div>
          <h2 className="text-ink font-bold text-lg mb-2">{m.title}</h2>
          <p className="text-ink/50 text-sm mb-8">{m.desc}</p>
          <a
            href={`https://wa.me/${SUPPORT_WA}?text=مشكلة في طلب ${code}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-green-500 text-white px-6 py-3 rounded-xl font-semibold text-sm"
          >
            <span>📲</span> تواصل معنا على واتساب
          </a>
        </div>
      </Page>
    )
  }

  /* ── CARD READY ── */
  return (
    <Page title="نماء كارد — فيزا افتراضية">
      {/* countdown */}
      {remaining !== null && remaining > 0 && (
        <div className={`text-center text-xs mb-4 font-mono font-semibold ${
          remaining < 3600 ? 'text-red-500' : 'text-ink/50'
        }`}>
          ⏱ الكارت صالح لـ {fmtCountdown(remaining)}
        </div>
      )}
      {remaining === 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-red-600 text-sm text-center">
          انتهت صلاحية الكارت — تواصل معنا
        </div>
      )}

      {/* VCard display */}
      <div className="flex justify-center mb-6">
        <VCard
          status={viewStep === 'revealed' && cardDetails ? 'revealed' : 'locked'}
          last4={cardDetails ? cardDetails.pan.slice(-4) : status.last4}
          holderName={cardDetails?.holder || status.holder || 'NAMAA CARD'}
          pan={cardDetails?.pan}
          cvv={cardDetails?.cvv}
          expiry={cardDetails?.expiry}
        />
      </div>

      {/* ── LOCKED (phone input) ── */}
      {viewStep === 'locked' && (
        <div className="bg-white rounded-2xl border border-line p-5 fade-up">
          <p className="text-ink font-semibold mb-1 text-center">🔒 الكارت مقفول</p>
          <p className="text-ink/50 text-xs text-center mb-5">
            أدخل رقم الواتساب اللي سجّلت بيه عشان نبعتلك كود التحقق
          </p>
          <label className="block text-xs text-ink/60 mb-1">رقم الواتساب</label>
          <input
            className={`input w-full mb-1 ${phoneErr ? 'border-red-400' : ''}`}
            placeholder="01xxxxxxxxx" inputMode="tel"
            value={phone} onChange={e => setPhone(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && requestOtp()}
          />
          {phoneErr && <p className="text-red-500 text-xs mb-3">{phoneErr}</p>}
          {otpErr && <p className="text-red-500 text-xs mb-3">{otpErr}</p>}
          <button onClick={requestOtp} className="btn-gold w-full py-3 rounded-xl font-bold mt-3">
            📲 ابعتلي الكود
          </button>
        </div>
      )}

      {/* ── OTP LOADING ── */}
      {viewStep === 'otp_loading' && (
        <div className="text-center py-8 fade-up">
          <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-ink/50 text-sm">ثانية...</p>
        </div>
      )}

      {/* ── OTP INPUT ── */}
      {viewStep === 'otp_input' && (
        <div className="bg-white rounded-2xl border border-line p-5 fade-up">
          <p className="text-ink font-semibold text-center mb-1">أدخل كود التحقق</p>
          <p className="text-ink/50 text-xs text-center mb-5">
            اتبعت واتساب على {phone} — صالح 10 دقايق
          </p>
          <div className="flex gap-2 justify-center mb-4 ltr">
            {otp.map((d, i) => (
              <input
                key={i}
                id={`otp-${i}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={e => handleOtpKey(i, e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Backspace' && !d && i > 0) {
                    document.getElementById(`otp-${i - 1}`)?.focus()
                  }
                }}
                className="w-11 h-14 text-center text-xl font-bold border-2 rounded-xl
                  border-line focus:border-gold focus:outline-none text-ink bg-paper"
              />
            ))}
          </div>
          {otpErr && <p className="text-red-500 text-xs text-center mb-3">{otpErr}</p>}
          <button
            onClick={() => verifyOtp()}
            disabled={otp.some(d => !d)}
            className="btn-gold w-full py-3 rounded-xl font-bold disabled:opacity-50"
          >
            🔓 افتح الكارت
          </button>
          <button onClick={() => { setViewStep('locked'); setOtp(['','','','','','']) }}
            className="w-full mt-2 text-ink/40 text-xs py-2">
            رجوع
          </button>
        </div>
      )}

      {/* ── REVEALED ── */}
      {viewStep === 'revealed' && cardDetails && (
        <div className="space-y-3 fade-up">
          {/* card fields */}
          {[
            { label: 'رقم الكارت (PAN)', val: cardDetails.pan, display: cardDetails.pan.replace(/(\d{4})/g, '$1 ').trim() },
            { label: 'CVV', val: cardDetails.cvv, display: cardDetails.cvv },
            { label: 'تاريخ الانتهاء (MM/YY)', val: cardDetails.expiry, display: cardDetails.expiry },
          ].map(field => (
            <div key={field.label} className="bg-white rounded-xl border border-line p-4 flex justify-between items-center">
              <div>
                <p className="text-xs text-ink/50 mb-1">{field.label}</p>
                <p className="font-mono font-bold text-ink text-lg ltr">{field.display}</p>
              </div>
              <button
                onClick={() => copyText(field.val, field.label)}
                className={`text-xs px-3 py-2 rounded-lg transition-all ${
                  copied === field.label
                    ? 'bg-green-100 text-green-600'
                    : 'bg-ink/5 text-ink/60 hover:bg-gold/20'
                }`}
              >
                {copied === field.label ? '✓ نُسخ' : 'نسخ'}
              </button>
            </div>
          ))}

          {/* billing address */}
          <div className="bg-white rounded-xl border border-line p-4">
            <p className="text-xs text-ink/50 mb-1">عنوان الفوترة (Billing Address)</p>
            <p className="text-sm text-ink font-medium">Cairo, Egypt · Postal Code: 11511</p>
            <p className="text-xs text-ink/40 mt-1">استخدم هذا العنوان لو يوتيوب طلب عنوان</p>
          </div>

          {/* one-use warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-700 text-sm">
            ⚠️ <strong>كارت وان-يوز:</strong> يُستخدم مرة واحدة فقط. بعد أول عملية شراء بينلغي تلقائيًا.
          </div>

          {/* youtube steps */}
          <div className="bg-white rounded-xl border border-line p-5">
            <p className="text-ink font-semibold mb-4 text-sm">🎬 خطوات الدفع على يوتيوب</p>
            <ol className="space-y-3 text-sm text-ink/70 list-decimal list-inside">
              <li>روح <strong>youtube.com/payments</strong> أو افتح يوتيوب بيمينتس</li>
              <li>اضغط "إضافة طريقة دفع" أو "Add Payment Method"</li>
              <li>اختار "Debit/Credit Card"</li>
              <li>أدخل رقم الكارت بدون مسافات</li>
              <li>أدخل تاريخ الانتهاء والـ CVV</li>
              <li>في خانة الاسم: اكتب {cardDetails.holder}</li>
              <li>لو طلب عنوان: Cairo, Egypt — Postal 11511</li>
              <li>اضغط "حفظ" وكمّل الاشتراك</li>
            </ol>
          </div>

          <div className="text-center pt-2">
            <a
              href={`https://wa.me/${SUPPORT_WA}?text=محتاج مساعدة في طلب ${code}`}
              target="_blank" rel="noopener noreferrer"
              className="text-green-600 text-sm underline"
            >
              📲 مشكلة؟ تواصل معنا
            </a>
          </div>
        </div>
      )}
    </Page>
  )
}

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper" dir="rtl">
      <header className="bg-ink px-4 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gold flex items-center justify-center text-ink font-bold text-sm">ن</div>
        <span className="text-white font-semibold text-sm">{title}</span>
      </header>
      <div className="max-w-md mx-auto px-4 py-6">
        {children}
      </div>
    </div>
  )
}
