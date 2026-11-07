import { useState, useEffect, lazy, Suspense } from 'react'
import { supabase, readCachedSession } from './lib/supabase.js'
import Auth from './components/Auth.jsx'
import ChipsRapidos from './components/ChipsRapidos.jsx'
import FormComida from './components/FormComida.jsx'
import FormReaccion from './components/FormReaccion.jsx'
import Notas from './components/Notas.jsx'
import Agua from './components/Agua.jsx'
import Historial from './components/Historial.jsx'
import ResumenIA from './components/ResumenIA.jsx'
import { useSync } from './hooks/useSync.js'
import Icon from './components/Icon.jsx'
import {
  mdiPlusCircleOutline, mdiHistory, mdiChartBar,
  mdiSync, mdiLogoutVariant, mdiFoodApple,
  mdiCloudCheck, mdiCloudOffOutline, mdiAlertCircleOutline,
  mdiNoteTextOutline, mdiCupWater, mdiBrain
} from '@mdi/js'

const Estadisticas = lazy(() => import('./components/Estadisticas.jsx'))

const TABS = [
  { key: 'registrar', label: 'Registrar', icon: mdiPlusCircleOutline },
  { key: 'notas', label: 'Notas', icon: mdiNoteTextOutline },
  { key: 'agua', label: 'Agua', icon: mdiCupWater },
  { key: 'historial', label: 'Historial', icon: mdiHistory },
  { key: 'stats', label: 'Stats', icon: mdiChartBar },
  { key: 'resumen', label: 'IA', icon: mdiBrain }
]

const TAB_GUARDADA = 'ft:tab'
const TABS_KEYS = TABS.map((t) => t.key)

export default function App() {
  const [bootSession] = useState(readCachedSession)
  const [session, setSession] = useState(bootSession)
  const [loading, setLoading] = useState(bootSession === null)
  const [tab, setTabState] = useState(() => {
    const guardada = localStorage.getItem(TAB_GUARDADA)
    return TABS_KEYS.includes(guardada) ? guardada : 'registrar'
  })

  const setTab = (key) => {
    setTabState(key)
    localStorage.setItem(TAB_GUARDADA, key)
  }

  const { syncing, lastSync, syncErrors, sync } = useSync(session?.user?.id)

  useEffect(() => {
    let activo = true
    const timeout = setTimeout(() => {
      if (activo && !bootSession) setLoading(false)
    }, 2500)

    supabase.auth.getSession().then(({ data }) => {
      if (!activo) return
      clearTimeout(timeout)
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!activo) return
      clearTimeout(timeout)
      setSession(s)
      setLoading(false)
    })

    return () => {
      activo = false
      clearTimeout(timeout)
      sub?.subscription?.unsubscribe()
    }
  }, [bootSession])

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    sessionStorage.clear()
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted">Cargando⬦</div>
  }

  if (!session) {
    return <Auth />
  }

  const userId = session.user.id

  return (
    <div className="max-w-2xl mx-auto px-3 pb-10" style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
      <header className="sticky top-0 z-30 pt-3 pb-2">
        <div className="glass rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/30">
              <Icon path={mdiFoodApple} size={1.2} className="text-white" />
            </div>
            <div>
              <h1 className="font-extrabold leading-none grad-text">FoodTracker</h1>
              <div className="text-[11px] text-muted flex items-center gap-1.5 mt-1">
                {syncing ? (
                  <span className="inline-flex items-center gap-1 text-amber-500">
                    <Icon path={mdiSync} size={0.7} className="animate-spin" /> Sincronizando···
                  </span>
                ) : navigator.onLine ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <Icon path={mdiCloudCheck} size={0.7} /> Online
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-400">
                    <Icon path={mdiCloudOffOutline} size={0.7} /> Offline · datos locales
                  </span>
                )}
                {lastSync && !syncing && navigator.onLine && (
                  <span className="text-slate-400">· {lastSync.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => sync()} className="btn-secondary !p-2" title="Sincronizar ahora">
              <Icon path={mdiSync} size={1} className={syncing ? 'animate-spin' : ''} />
            </button>
            <button onClick={cerrarSesion} className="btn-secondary !p-2 !text-slate-400 hover:!text-rose-400" title="Cerrar sesión">
              <Icon path={mdiLogoutVariant} size={1} />
            </button>
          </div>
        </div>
      </header>

{syncErrors.length > 0 && (
        <div className="mt-2 flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5 animate-fade-up">
          <Icon path={mdiAlertCircleOutline} size={0.9} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold mb-1">No se pudo sincronizar:</p>
            <ul className="space-y-0.5">
              {syncErrors.map((e) => (
                <li key={`${e.op}-${e.table}`}>
                  <b className="text-amber-200">{e.table}</b> · {e.op}: {e.message}
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-slate-400">Tus datos quedan guardados localmente y se reintentan solos.</span>
              <button onClick={() => sync()} className="btn-secondary !py-1 !px-2 !text-[11px] shrink-0">Reintentar</button>
            </div>
          </div>
        </div>
      )}

      <nav className="flex gap-2 my-4 bg-[#101e38]/80 backdrop-blur p-1.5 rounded-2xl border border-line/60 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              tab === t.key
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon path={t.icon} size={0.95} />
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'registrar' && (
        <div className="space-y-4 animate-fade-up">
          <ChipsRapidos userId={userId} />
          <FormComida userId={userId} />
          <FormReaccion userId={userId} />
        </div>
      )}

      {tab === 'notas' && <Notas userId={userId} />}

      {tab === 'agua' && <Agua userId={userId} />}

      {tab === 'historial' && <Historial userId={userId} />}
      {tab === 'stats' && (
        <Suspense fallback={<div className="card text-center py-12 text-muted">Cargando gráficos⬦</div>}>
          <Estadisticas userId={userId} />
        </Suspense>
      )}
      {tab === 'resumen' && <ResumenIA userId={userId} />}
    </div>
  )
}