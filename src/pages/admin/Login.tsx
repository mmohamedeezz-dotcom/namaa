import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setErr('')
    if (!email || !password) { setErr('أدخل الإيميل والباسورد'); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErr('بيانات دخول غلط')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gold flex items-center justify-center mx-auto mb-3">
            <span className="text-ink font-bold text-2xl">ن</span>
          </div>
          <h1 className="text-ink font-bold text-xl">نماء كارد — إدارة</h1>
          <p className="text-ink/40 text-xs mt-1">للمدراء فقط</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-ink/60 mb-1">الإيميل</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="input w-full" placeholder="admin@alnamaa.eg" />
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">الباسورد</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="input w-full" placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          {err && <p className="text-red-500 text-xs">{err}</p>}
          <button onClick={handleLogin} disabled={loading}
            className="btn-gold w-full py-3 rounded-xl font-bold disabled:opacity-60 flex items-center justify-center gap-2">
            {loading
              ? <><span className="w-4 h-4 border-2 border-ink border-t-transparent rounded-full animate-spin" />جاري الدخول...</>
              : '🔐 دخول'}
          </button>
        </div>
      </div>
    </div>
  )
}
