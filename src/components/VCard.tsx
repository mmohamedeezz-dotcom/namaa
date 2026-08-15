type Details = {
  pan?: string | null
  cvv?: string | null
  expiry_month?: string | null
  expiry_year?: string | null
  name?: string | null
}

export default function VCard({
  amountUsd, name, last4, details, state = 'preview'
}: {
  amountUsd?: number
  name?: string
  last4?: string | null
  details?: Details | null
  state?: 'preview' | 'locked' | 'revealed' | 'frozen'
}) {
  const pan = details?.pan
    ? String(details.pan).replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim()
    : last4 ? `•••• •••• •••• ${last4}` : '•••• •••• •••• ••••'
  const exp = details?.expiry_month && details?.expiry_year
    ? `${details.expiry_month}/${String(details.expiry_year).slice(-2)}`
    : '••/••'
  return (
    <div className="vcard select-none">
      <div className="absolute inset-0 flex flex-col justify-between p-5" dir="ltr">
        <div className="flex items-start justify-between">
          <div className="vchip" />
          <div className="text-right">
            <div className="font-display text-[11px] font-extrabold tracking-widest text-gold">NAMAA CARD</div>
            {typeof amountUsd === 'number' && amountUsd > 0 && (
              <div className="mono font-display text-2xl font-black text-paper">${amountUsd.toFixed(2)}</div>
            )}
          </div>
        </div>

        <div>
          <div className="mono text-[19px] font-bold sm:text-[22px]">{pan}</div>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <div className="text-[9px] uppercase tracking-widest text-paper/50">Card Holder</div>
              <div className="max-w-[200px] truncate text-[13px] font-bold uppercase">{details?.name || name || 'YOUR NAME'}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] uppercase tracking-widest text-paper/50">Valid Thru</div>
              <div className="mono text-[13px] font-bold">{exp}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] uppercase tracking-widest text-paper/50">CVV</div>
              <div className="mono text-[13px] font-bold">{state === 'revealed' && details?.cvv ? details.cvv : '•••'}</div>
            </div>
            <div className="font-display text-xl font-black italic tracking-tight text-paper/90">VISA</div>
          </div>
        </div>
      </div>

      {state === 'locked' && (
        <div className="absolute inset-0 grid place-items-center bg-ink/55 backdrop-blur-[2px]">
          <div className="rounded-full border border-gold/50 bg-ink/80 px-4 py-1.5 text-[13px] font-bold text-gold">🔒 البيانات محمية — فك القفل تحت</div>
        </div>
      )}
      {state === 'frozen' && (
        <div className="absolute inset-0 grid place-items-center bg-ink/60">
          <div className="rounded-full border border-paper/30 bg-ink/80 px-4 py-1.5 text-[13px] font-bold text-paper/80">الكارت اتقفل بعد الاستخدام ✓</div>
        </div>
      )}
    </div>
  )
}
