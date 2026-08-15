import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { adminApi, fmtEGP, fmtUSD } from '../../lib/api'

type Tab = 'overview' | 'orders' | 'packages' | 'settings' | 'logs'

interface Stats {
  total_orders: number
  paid_orders: number
  card_ready: number
  used_cards: number
  total_egp: number
  total_usd_issued: number
  failed_orders: number
  refund_needed: number
}

interface Order {
  id: string
  order_code: string
  name_ar: string
  phone: string
  email: string
  card_usd: number
  amount_egp: number
  status: string
  created_at: string
  first_name_en: string
  last_name_en: string
  kashier_ref: string | null
  card?: {
    status: string
    last4: string
    bitnob_card_id: string
    first_used_at: string | null
    frozen_at: string | null
  } | null
}

interface Setting {
  key: string
  value: string
  description?: string
}

interface Package {
  id?: string
  label: string
  youtube_price_egp: number
  card_usd: number
  price_egp: number
  active: boolean
  sort: number
}

interface WebhookLog {
  id: string
  source: string
  event_type: string
  order_code: string | null
  success: boolean
  created_at: string
  payload: Record<string, unknown>
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:      { label: 'معلق',       color: 'text-yellow-600 bg-yellow-50' },
  paid:         { label: 'مدفوع',      color: 'text-blue-600 bg-blue-50' },
  issuing:      { label: 'جاري',       color: 'text-blue-600 bg-blue-50' },
  card_ready:   { label: 'جاهز',       color: 'text-green-600 bg-green-50' },
  used:         { label: 'مستخدم',     color: 'text-ink/60 bg-ink/5' },
  expired:      { label: 'منتهي',      color: 'text-ink/40 bg-ink/5' },
  failed:       { label: 'فشل',        color: 'text-red-600 bg-red-50' },
  refund_needed:{ label: 'استرداد',    color: 'text-orange-600 bg-orange-50' },
  cancelled:    { label: 'ملغي',       color: 'text-ink/40 bg-ink/5' },
}

export default function Admin() {
  const [tab, setTab] = useState<Tab>('overview')
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setToken(s?.access_token ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const call = useCallback(
    (path: string, opts?: RequestInit) => adminApi(token!, path, opts),
    [token],
  )

  async function logout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="min-h-screen bg-paper" dir="rtl">
      {/* header */}
      <header className="bg-ink text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gold flex items-center justify-center text-ink font-bold text-sm">ن</div>
          <span className="font-semibold text-sm">نماء كارد — إدارة</span>
        </div>
        <button onClick={logout} className="text-white/50 text-xs hover:text-white">خروج</button>
      </header>

      {/* tabs */}
      <nav className="bg-white border-b border-line flex overflow-x-auto">
        {([
          ['overview',  '📊 نظرة عامة'],
          ['orders',    '📋 الطلبات'],
          ['packages',  '📦 الباقات'],
          ['settings',  '⚙️ الإعدادات'],
          ['logs',      '📝 السجلات'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t ? 'border-gold text-ink' : 'border-transparent text-ink/50 hover:text-ink'
            }`}>
            {label}
          </button>
        ))}
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {tab === 'overview'  && token && <Overview call={call} />}
        {tab === 'orders'    && token && <Orders call={call} />}
        {tab === 'packages'  && token && <Packages call={call} />}
        {tab === 'settings'  && token && <Settings call={call} />}
        {tab === 'logs'      && token && <Logs call={call} />}
      </div>
    </div>
  )
}

/* ──────────────────────── OVERVIEW ──────────────────────── */
function Overview({ call }: { call: Function }) {
  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => { call('/api/admin/stats').then(setStats).catch(console.error) }, [call])

  if (!stats) return <Spinner />
  const cards = [
    { label: 'إجمالي الطلبات',   val: stats.total_orders,     color: 'bg-ink text-white' },
    { label: 'مدفوع',             val: stats.paid_orders,      color: 'bg-blue-50 text-blue-700' },
    { label: 'كروت جاهزة',        val: stats.card_ready,       color: 'bg-green-50 text-green-700' },
    { label: 'مستخدمة',           val: stats.used_cards,       color: 'bg-ink/10 text-ink' },
    { label: 'إجمالي المحصّل',    val: fmtEGP(stats.total_egp), color: 'bg-gold/20 text-ink' },
    { label: 'إجمالي USD صُدر',   val: fmtUSD(stats.total_usd_issued), color: 'bg-gold/10 text-ink' },
    { label: 'فشل',               val: stats.failed_orders,    color: 'bg-red-50 text-red-600' },
    { label: 'استرداد مطلوب',     val: stats.refund_needed,    color: 'bg-orange-50 text-orange-600' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map(c => (
        <div key={c.label} className={`rounded-xl p-4 ${c.color}`}>
          <p className="text-xs opacity-70 mb-1">{c.label}</p>
          <p className="text-2xl font-bold">{c.val}</p>
        </div>
      ))}
    </div>
  )
}

/* ──────────────────────── ORDERS ──────────────────────── */
function Orders({ call }: { call: Function }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Order | null>(null)
  const [actionLoading, setActionLoading] = useState('')
  const [revealedDetails, setRevealedDetails] = useState<Record<string, unknown> | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (search) qs.set('q', search)
    if (filterStatus) qs.set('status', filterStatus)
    const r = await call(`/api/admin/orders?${qs}`).catch(() => ({ orders: [] }))
    setOrders(r.orders || [])
    setLoading(false)
  }, [call, search, filterStatus])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  async function doAction(action: string, orderCode: string, extra?: Record<string, unknown>) {
    setActionLoading(action)
    try {
      const r = await call(`/api/admin/${action}`, {
        method: 'POST',
        body: JSON.stringify({ order_code: orderCode, ...extra }),
      })
      if (action === 'reveal') { setRevealedDetails(r); return }
      await fetchOrders()
      if (selected?.order_code === orderCode) {
        const updated = await call(`/api/admin/order?code=${orderCode}`)
        setSelected(updated.order || null)
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'حصل خطأ')
    } finally {
      setActionLoading('')
    }
  }

  return (
    <div>
      {/* filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="بحث باسم أو رقم أو إيميل..." className="input flex-1 min-w-48" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="input w-36">
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* table */}
      {loading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-line overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink/5 text-ink/60 text-xs">
              <tr>
                <th className="px-3 py-3 text-right">كود</th>
                <th className="px-3 py-3 text-right">العميل</th>
                <th className="px-3 py-3 text-right">USD</th>
                <th className="px-3 py-3 text-right">المبلغ</th>
                <th className="px-3 py-3 text-right">الحالة</th>
                <th className="px-3 py-3 text-right">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => {
                const s = STATUS_LABELS[o.status] || { label: o.status, color: '' }
                return (
                  <tr key={o.id} onClick={() => { setSelected(o); setRevealedDetails(null) }}
                    className="border-t border-line hover:bg-gold/5 cursor-pointer">
                    <td className="px-3 py-3 font-mono text-xs text-ink/60">{o.order_code}</td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-ink">{o.name_ar}</p>
                      <p className="text-xs text-ink/40">{o.phone}</p>
                    </td>
                    <td className="px-3 py-3 font-mono">{fmtUSD(o.card_usd)}</td>
                    <td className="px-3 py-3 font-semibold text-gold">{fmtEGP(o.amount_egp)}</td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.color}`}>{s.label}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-ink/40">
                      {new Date(o.created_at).toLocaleDateString('ar-EG')}
                    </td>
                  </tr>
                )
              })}
              {orders.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-ink/40">لا يوجد نتائج</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* detail drawer */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
          onClick={() => setSelected(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto p-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-ink">{selected.order_code}</h3>
              <button onClick={() => setSelected(null)} className="text-ink/40 text-xl">×</button>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-sm mb-5">
              {[
                ['الاسم', selected.name_ar],
                ['الإنجليزي', `${selected.first_name_en} ${selected.last_name_en}`],
                ['الموبايل', selected.phone],
                ['الإيميل', selected.email],
                ['المبلغ', fmtEGP(selected.amount_egp)],
                ['الكارت', fmtUSD(selected.card_usd)],
                ['كاشير', selected.kashier_ref || '—'],
                ['Bitnob', selected.card?.bitnob_card_id || '—'],
                ['آخر 4', selected.card?.last4 || '—'],
                ['حالة الكارت', selected.card?.status || '—'],
              ].map(([k, v]) => (
                <div key={k}><dt className="text-ink/40 text-xs">{k}</dt><dd className="font-medium text-ink">{v}</dd></div>
              ))}
            </dl>

            {/* actions */}
            <div className="flex flex-wrap gap-2">
              {['paid','issuing'].includes(selected.status) && (
                <ActionBtn label="🔄 إصدار يدوي" loading={actionLoading === 'retry'}
                  onClick={() => doAction('retry', selected.order_code)} />
              )}
              {selected.status === 'issuing' && (
                <ActionBtn label="🔃 مزامنة" loading={actionLoading === 'sync'}
                  onClick={() => doAction('sync', selected.order_code)} />
              )}
              {selected.card?.status === 'active' && (
                <ActionBtn label="❄️ تجميد" loading={actionLoading === 'freeze'}
                  onClick={() => doAction('freeze', selected.order_code)} />
              )}
              {selected.card?.status === 'frozen' && (
                <ActionBtn label="▶️ تفعيل" loading={actionLoading === 'activate'}
                  onClick={() => doAction('activate', selected.order_code)} />
              )}
              {selected.card?.status && !['terminated','failed'].includes(selected.card.status) && (
                <ActionBtn label="🗑 إنهاء الكارت" loading={actionLoading === 'terminate'}
                  onClick={() => { if (confirm('إنهاء الكارت؟')) doAction('terminate', selected.order_code) }}
                  danger />
              )}
              {selected.card?.status === 'active' && (
                <ActionBtn label="👁 كشف البيانات" loading={actionLoading === 'reveal'}
                  onClick={() => doAction('reveal', selected.order_code)} />
              )}
              <ActionBtn label="📲 إعادة الإرسال" loading={actionLoading === 'resend'}
                onClick={() => doAction('resend', selected.order_code)} />
            </div>

            {/* revealed card details */}
            {revealedDetails && (
              <div className="mt-4 bg-ink rounded-xl p-4 font-mono text-green-400 text-sm space-y-1">
                {Object.entries(revealedDetails).map(([k, v]) => (
                  <div key={k}><span className="text-white/50">{k}: </span>{String(v)}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ActionBtn({ label, onClick, loading, danger }: {
  label: string; onClick: () => void; loading: boolean; danger?: boolean
}) {
  return (
    <button onClick={onClick} disabled={loading}
      className={`text-xs px-3 py-2 rounded-lg font-medium disabled:opacity-50 ${
        danger ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-ink/5 text-ink hover:bg-gold/20'
      }`}>
      {loading ? '...' : label}
    </button>
  )
}

/* ──────────────────────── PACKAGES ──────────────────────── */
function Packages({ call }: { call: Function }) {
  const [pkgs, setPkgs] = useState<Package[]>([])
  const [editing, setEditing] = useState<Package | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchPkgs = useCallback(async () => {
    const r = await call('/api/admin/packages-all').catch(() => ({ packages: [] }))
    setPkgs(r.packages || [])
  }, [call])

  useEffect(() => { fetchPkgs() }, [fetchPkgs])

  function newPkg(): Package {
    return { label: '', youtube_price_egp: 0, card_usd: 0, price_egp: 0, active: true, sort: 99 }
  }

  async function save() {
    if (!editing) return
    setLoading(true)
    await call('/api/admin/packages-save', { method: 'POST', body: JSON.stringify(editing) }).catch((e: Error) => alert(e.message))
    setLoading(false)
    setEditing(null)
    fetchPkgs()
  }

  async function deletePkg(id: string) {
    if (!confirm('حذف الباقة؟')) return
    await call('/api/admin/packages-delete', { method: 'POST', body: JSON.stringify({ id }) }).catch((e: Error) => alert(e.message))
    fetchPkgs()
  }

  const ef = (k: keyof Package, v: unknown) => setEditing(prev => prev ? { ...prev, [k]: v } : prev)

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-ink font-bold">الباقات</h2>
        <button onClick={() => setEditing(newPkg())} className="btn-gold px-4 py-2 rounded-xl text-sm font-bold">
          + باقة جديدة
        </button>
      </div>

      <div className="space-y-3">
        {pkgs.map(p => (
          <div key={p.id} className={`bg-white rounded-xl border p-4 flex justify-between items-center ${p.active ? 'border-line' : 'border-line opacity-50'}`}>
            <div>
              <p className="font-semibold text-ink">{p.label}</p>
              <p className="text-xs text-ink/50">{fmtUSD(p.card_usd)} · {fmtEGP(p.price_egp)}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing({ ...p })} className="text-xs px-3 py-2 bg-ink/5 rounded-lg">تعديل</button>
              <button onClick={() => deletePkg(p.id!)} className="text-xs px-3 py-2 bg-red-50 text-red-600 rounded-lg">حذف</button>
            </div>
          </div>
        ))}
      </div>

      {/* edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5">
            <h3 className="font-bold text-ink mb-4">{editing.id ? 'تعديل باقة' : 'باقة جديدة'}</h3>
            <div className="space-y-3">
              {([
                ['label', 'الاسم', 'text'],
                ['youtube_price_egp', 'سعر يوتيوب (ج.م)', 'number'],
                ['card_usd', 'قيمة الكارت (USD)', 'number'],
                ['price_egp', 'السعر النهائي (ج.م)', 'number'],
                ['sort', 'الترتيب', 'number'],
              ] as [keyof Package, string, string][]).map(([k, lbl, type]) => (
                <div key={k}>
                  <label className="block text-xs text-ink/60 mb-1">{lbl}</label>
                  <input type={type} value={String(editing[k])}
                    onChange={e => ef(k, type === 'number' ? Number(e.target.value) : e.target.value)}
                    className="input w-full" />
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.active} onChange={e => ef('active', e.target.checked)} />
                مفعّل
              </label>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={save} disabled={loading} className="btn-gold flex-1 py-3 rounded-xl font-bold text-sm disabled:opacity-60">
                {loading ? '...' : 'حفظ'}
              </button>
              <button onClick={() => setEditing(null)} className="flex-1 py-3 rounded-xl border border-line text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ──────────────────────── SETTINGS ──────────────────────── */
function Settings({ call }: { call: Function }) {
  const [settings, setSettings] = useState<Setting[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    call('/api/admin/settings-get').then((r: { settings: Setting[] }) => {
      setSettings(r.settings || [])
      const v: Record<string, string> = {}
      r.settings?.forEach((s: Setting) => { v[s.key] = s.value })
      setValues(v)
    }).catch(console.error)
  }, [call])

  async function saveSettings() {
    setSaving(true)
    await call('/api/admin/settings-save', { method: 'POST', body: JSON.stringify({ settings: values }) })
      .catch((e: Error) => alert(e.message))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-ink font-bold mb-5">الإعدادات</h2>
      <div className="space-y-4">
        {settings.map(s => (
          <div key={s.key}>
            <label className="block text-xs text-ink/60 mb-1">{s.key}</label>
            {s.description && <p className="text-xs text-ink/40 mb-1">{s.description}</p>}
            <input className="input w-full" value={values[s.key] ?? ''} onChange={e => setValues(p => ({ ...p, [s.key]: e.target.value }))} />
          </div>
        ))}
      </div>
      <button onClick={saveSettings} disabled={saving}
        className="btn-gold mt-6 px-8 py-3 rounded-xl font-bold disabled:opacity-60">
        {saving ? 'جاري الحفظ...' : saved ? '✓ تم الحفظ' : 'حفظ الإعدادات'}
      </button>
    </div>
  )
}

/* ──────────────────────── LOGS ──────────────────────── */
function Logs({ call }: { call: Function }) {
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [source, setSource] = useState('')

  useEffect(() => {
    const qs = source ? `?source=${source}` : ''
    call(`/api/admin/logs${qs}`).then((r: { logs: WebhookLog[] }) => setLogs(r.logs || [])).catch(console.error)
  }, [call, source])

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <select value={source} onChange={e => setSource(e.target.value)} className="input w-40">
          <option value="">كل المصادر</option>
          <option value="kashier">كاشير</option>
          <option value="bitnob">Bitnob</option>
        </select>
      </div>
      <div className="space-y-2">
        {logs.map(l => (
          <details key={l.id} className="bg-white rounded-xl border border-line">
            <summary className="flex justify-between items-center px-4 py-3 cursor-pointer">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${l.success ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="text-xs font-mono text-ink/60">{l.source}</span>
                <span className="text-xs text-ink">{l.event_type}</span>
                {l.order_code && <span className="text-xs text-gold font-mono">{l.order_code}</span>}
              </div>
              <span className="text-xs text-ink/40">{new Date(l.created_at).toLocaleString('ar-EG')}</span>
            </summary>
            <pre className="px-4 py-3 text-xs bg-ink/5 rounded-b-xl overflow-x-auto text-ink/70 border-t border-line">
              {JSON.stringify(l.payload, null, 2)}
            </pre>
          </details>
        ))}
        {logs.length === 0 && <p className="text-center text-ink/40 py-8">لا يوجد سجلات</p>}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
    </div>
  )
}
