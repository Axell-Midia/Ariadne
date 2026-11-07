import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import Icon from './Icon.jsx'
import { mdiFoodApple, mdiEmailOutline, mdiKeyOutline, mdiShieldCheckOutline, mdiWifiOff } from '@mdi/js'

export default function Auth() {
  const [modo, setModo] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      if (modo === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data.session) {
          setInfo('Cuenta creada. ¡Bienvenido!')
        } else {
          setInfo('Revisa tu email para confirmar la cuenta y luego inicia sesión.')
          setModo('login')
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="card max-w-sm w-full animate-fade-up p-6">
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto mb-3 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-xl shadow-emerald-500/40">
            <Icon path={mdiFoodApple} size={2.5} className="text-white" />
          </div>
          <h1 className="text-3xl font-extrabold grad-text">FoodTracker</h1>
          <p className="text-sm text-muted mt-1">Tus comidas y reacciones, con hora exacta y sin internet.</p>
        </div>

        <div className="flex rounded-xl overflow-hidden border border-line bg-[#0c1830] p-0.5 mb-5">
          <button
            type="button"
            onClick={() => { setModo('login'); setError(null); setInfo(null) }}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${modo === 'login' ? 'bg-slate-800 text-emerald-400 shadow-sm' : 'text-slate-500'}`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => { setModo('registro'); setError(null); setInfo(null) }}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${modo === 'registro' ? 'bg-slate-800 text-emerald-400 shadow-sm' : 'text-slate-500'}`}
          >
            Crear cuenta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted block mb-1">Email</label>
            <div className="relative">
              <Icon path={mdiEmailOutline} size={1} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="email" required className="pl-10" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted block mb-1">Contraseña</label>
            <div className="relative">
              <Icon path={mdiKeyOutline} size={1} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="password" required minLength={8} className="pl-10" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="⬢⬢⬢⬢⬢⬢⬢⬢" />
            </div>
          </div>

          {error && <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-2.5">{error}</div>}
          {info && <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2.5">{info}</div>}

          <button type="submit" className="btn-primary w-full py-2.5 flex items-center justify-center gap-2" disabled={loading}>
            {loading ? 'Procesando···' : (modo === 'login' ? 'Entrar' : 'Crear cuenta')}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-line/60 space-y-1.5">
          <p className="text-xs text-muted flex items-center gap-1.5">
            <Icon path={mdiShieldCheckOutline} size={0.8} className="text-emerald-500" />
            Datos privados por usuario (Row Level Security)
          </p>
          <p className="text-xs text-muted flex items-center gap-1.5">
            <Icon path={mdiWifiOff} size={0.8} className="text-cyan-500" />
            Funciona sin conexión y sincroniza solo
          </p>
        </div>
      </div>
    </div>
  )
}