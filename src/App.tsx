import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import CardView from './pages/CardView'
import AdminLogin from './pages/admin/Login'
import Admin from './pages/admin/Admin'
import { supabase } from './lib/supabase'

function AdminGuard({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session)
      setChecked(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setAuthed(!!s)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (!checked) return null
  return authed ? <>{children}</> : <Navigate to="/admin" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/card/:code" element={<CardView />} />
      <Route path="/admin" element={<AdminLogin />} />
      <Route path="/admin/panel" element={<AdminGuard><Admin /></AdminGuard>} />
      <Route path="*" element={<Home />} />
    </Routes>
  )
}
