import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db.js'
import { construirContexto, conteoDelDia } from '../lib/resumen.js'
import {
  MODELOS,
  modeloGuardado,
  guardarModelo,
  webgpuDisponible,
  modeloDescargado,
  cargarMotor,
  analizar,
  detener,
  borrarModelo,
  mensajeDeError
} from '../lib/ia.js'
import Icon from './Icon.jsx'
import {
  mdiBrain,
  mdiFoodApple,
  mdiHeartPulse,
  mdiCupWater,
  mdiNoteTextOutline,
  mdiPlayCircleOutline,
  mdiContentSaveOutline,
  mdiReload,
  mdiStopCircleOutline,
  mdiDeleteOutline,
  mdiAlertCircleOutline,
  mdiCheckCircleOutline,
  mdiInformationOutline
} from '@mdi/js'

const VACIO = { comidas: 0, malestares: 0, vasos: 0, notas: 0 }

export default function ResumenIA({ userId }) {
  const [webgpu, setWebgpu] = useState(null)
  const [descargados, setDescargados] = useState({})
  const [modelo, setModelo] = useState(modeloGuardado)
  const [fase, setFase] = useState('inactivo') // inactivo | descarga | generando | listo | error
  const [progreso, setProgreso] = useState(null)
  const [salida, setSalida] = useState('')
  const [error, setError] = useState(null)
  const [guardadoNota, setGuardadoNota] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)

  useEffect(() => {
    let vivo = true
    webgpuDisponible().then((ok) => vivo && setWebgpu(ok))
    for (const m of MODELOS) {
      modeloDescargado(m.id).then((d) => {
        if (vivo) setDescargados((prev) => ({ ...prev, [m.id]: d }))
      })
    }
    return () => {
      vivo = false
    }
  }, [])

  const hoyKey = new Date().toDateString()
  const delDia =
    useLiveQuery(async () => conteoDelDia(userId), [userId, hoyKey]) || VACIO
  const hayDatos = delDia.comidas + delDia.malestares + delDia.notas + delDia.vasos > 0
  const ocupado = fase === 'descarga' || fase === 'generando'

  const analizarDia = async () => {
    setError(null)
    setSalida('')
    setGuardadoNota(false)
    setProgreso(null)
    setConfirmarBorrar(false)
    try {
      setFase('descarga')
      const ctx = await construirContexto(userId)
      if (ctx.vacio) {
        setFase('inactivo')
        setError('Aún no registraste nada hoy: comidas, malestares, agua o notas.')
        return
      }
      await cargarMotor(modelo, (rep) => {
        setProgreso({ p: Math.round((rep.progress || 0) * 100), t: String(rep.text || '') })
      })
      setDescargados((prev) => ({ ...prev, [modelo]: true }))
      setProgreso(null)
      setFase('generando')
      const texto = await analizar({ contexto: ctx.texto, onToken: setSalida })
      if (texto) {
        setSalida(texto)
        setFase('listo')
      } else {
        setFase('error')
        setError('El modelo no devolvió texto. Intenta de nuevo.')
      }
    } catch (e) {
      setProgreso(null)
      setFase('error')
      setError(mensajeDeError(e))
    }
  }

  const cambiarModelo = (id) => {
    if (ocupado || id === modelo) return
    setModelo(id)
    guardarModelo(id)
    setConfirmarBorrar(false)
    modeloDescargado(id).then((d) => setDescargados((prev) => ({ ...prev, [id]: d })))
  }

  const guardarComoNota = async () => {
    try {
      const fecha = new Date()
      await db.notas.put({
        id: crypto.randomUUID(),
        contenido: `📋 Análisis IA · ${fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}\n\n${salida}`,
        fecha_hora: fecha.toISOString(),
        usuario_id: userId,
        _sync: 'pending'
      })
      setGuardadoNota(true)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  const liberarEspacio = async () => {
    try {
      await borrarModelo(modelo)
      setDescargados((prev) => ({ ...prev, [modelo]: false }))
      setConfirmarBorrar(false)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  const chips = [
    { icon: mdiFoodApple, n: delDia.comidas, t: 'comidas' },
    { icon: mdiHeartPulse, n: delDia.malestares, t: 'malestares' },
    { icon: mdiCupWater, n: delDia.vasos, t: 'vasos' },
    { icon: mdiNoteTextOutline, n: delDia.notas, t: 'notas' }
  ]

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="card">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center shadow-md shadow-teal-500/30 shrink-0">
            <Icon path={mdiBrain} size={1.15} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-base leading-tight">Análisis de tu día</h2>
            <p className="text-[11px] text-muted mt-0.5">
              IA local en tu dispositivo · sin nube · no es consejo médico
            </p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-3">
          {chips.map((c) => (
            <div key={c.t} className="bg-[#101e38]/70 border border-line/60 rounded-xl py-2 text-center">
              <Icon path={c.icon} size={0.9} className="text-emerald-400 mx-auto" />
              <div className="text-sm font-bold mt-0.5 leading-none">{c.n}</div>
              <div className="text-[10px] text-muted mt-0.5">{c.t}</div>
            </div>
          ))}
        </div>
      </div>

      {webgpu === false && (
        <div className="flex items-start gap-2 text-xs text-sky-200 bg-sky-500/10 border border-sky-500/30 rounded-xl p-3">
          <Icon path={mdiInformationOutline} size={0.95} className="mt-0.5 shrink-0" />
          <span>
            Este navegador no soporta <b>WebGPU</b>, necesario para la IA local. Usa Chrome o Edge
            recientes (Android o escritorio) para poder analizar tu día.
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5">
          <Icon path={mdiAlertCircleOutline} size={0.95} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {webgpu !== false && !ocupado && (
        <div className="card !p-3.5">
          <div className="text-xs font-semibold text-muted mb-2">
            Modelo de IA (se descarga una sola vez)
          </div>
          <div className="flex gap-2">
            {MODELOS.map((m) => (
              <button
                key={m.id}
                onClick={() => cambiarModelo(m.id)}
                disabled={ocupado}
                className={`flex-1 rounded-xl border px-3 py-2 text-left transition ${
                  modelo === m.id
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-line/60 hover:border-slate-500'
                }`}
              >
                <div
                  className={`text-sm font-semibold ${modelo === m.id ? 'text-emerald-300' : 'text-slate-300'}`}
                >
                  {m.nombre}
                </div>
                <div className="text-[10px] text-muted leading-tight">{m.detalle}</div>
                {descargados[m.id] && (
                  <div className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-1">
                    <Icon path={mdiCheckCircleOutline} size={0.6} /> ya en tu equipo
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {fase === 'descarga' && (
        <div className="card">
          <div className="flex items-center justify-between mb-2 text-sm font-semibold">
            <span>Cargando el modelo⋯</span>
            <span className="text-emerald-400">{progreso ? `${progreso.p}%` : '⋯'}</span>
          </div>
          <div className="h-2 rounded-full bg-[#0a1420] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
              style={{ width: `${progreso ? progreso.p : 3}%` }}
            />
          </div>
          <p className="text-[11px] text-muted mt-2 break-all">
            {progreso ? progreso.t : 'Preparando⬦'}
          </p>
          <p className="text-[11px] text-muted mt-1">
            La primera vez tarda según tu conexión; luego queda guardado y carga en segundos.
          </p>
        </div>
      )}

      {(fase === 'generando' || fase === 'listo') && (
        <div className="card">
          <div className="flex items-center justify-between mb-2 gap-2">
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <Icon path={mdiBrain} size={0.9} className="text-teal-400" />
              Análisis {fase === 'generando' ? '(generando⋯)' : 'de hoy'}
            </h3>
            {fase === 'generando' && (
              <button
                onClick={() => detener()}
                className="btn-secondary !py-1.5 !px-3 text-xs rounded-lg flex items-center gap-1 shrink-0"
              >
                <Icon path={mdiStopCircleOutline} size={0.8} /> Detener
              </button>
            )}
          </div>
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-slate-200 max-h-[45vh] overflow-y-auto">
            {salida || 'Generando⬦'}
          </div>
          {fase === 'listo' && (
            <div className="flex gap-2 mt-3 flex-wrap">
              <button
                onClick={guardarComoNota}
                disabled={guardadoNota}
                className="btn-primary py-2 px-3 rounded-xl text-sm flex items-center gap-1.5 disabled:opacity-70"
              >
                <Icon path={guardadoNota ? mdiCheckCircleOutline : mdiContentSaveOutline} size={0.9} />
                {guardadoNota ? 'Guardado en Notas' : 'Guardar como nota'}
              </button>
              <button
                onClick={analizarDia}
                className="btn-secondary py-2 px-3 rounded-xl text-sm flex items-center gap-1.5"
              >
                <Icon path={mdiReload} size={0.9} /> Repetir
              </button>
              {descargados[modelo] &&
                (confirmarBorrar ? (
                  <button
                    onClick={liberarEspacio}
                    className="btn-danger py-2 px-3 rounded-xl text-xs font-semibold"
                  >
                    ¿Seguro? Borrar modelo
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmarBorrar(true)}
                    className="btn-secondary !text-slate-400 hover:!text-rose-400 py-2 px-3 rounded-xl text-xs flex items-center gap-1.5"
                  >
                    <Icon path={mdiDeleteOutline} size={0.9} /> Borrar modelo
                  </button>
                ))}
            </div>
          )}
          {fase === 'listo' && guardadoNota && (
            <p className="text-xs text-emerald-400 mt-2">✓ Guardado en la pestaña Notas.</p>
          )}
        </div>
      )}

      {webgpu !== false && !ocupado && fase !== 'listo' && (
        <>
          <button
            onClick={analizarDia}
            disabled={webgpu === null || !hayDatos}
            className="w-full btn-primary py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Icon path={mdiPlayCircleOutline} size={1.1} />
            {fase === 'error' ? 'Reintentar análisis' : 'Analizar mi día'}
          </button>
          {!hayDatos && (
            <p className="text-xs text-muted text-center -mt-2">
              Registra comida, malestares, agua o notas hoy para poder analizar tu día.
            </p>
          )}
        </>
      )}
    </div>
  )
}
