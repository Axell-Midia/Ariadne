import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import Autocomplete from './Autocomplete.jsx'
import HeadMap from './HeadMap.jsx'
import { db } from '../lib/db.js'
import { ES_DOLOR_CABEZA } from '../lib/zonas.js'
import Icon from './Icon.jsx'
import {
  mdiPill, mdiCheckCircle, mdiPlus, mdiMagnify,
  mdiLinkVariant, mdiLinkOff, mdiClockOutline, mdiAlertCircleOutline, mdiHead, mdiDeleteOutline
} from '@mdi/js'

const SEVERIDADES = [
  { key: 'leve', label: 'Leve', cls: 'severidad-leve' },
  { key: 'moderada', label: 'Moderada', cls: 'severidad-moderada' },
  { key: 'fuerte', label: 'Fuerte', cls: 'severidad-fuerte' }
]

const CAMPOS = ['nombre']

export default function FormReaccion({ userId }) {
  const [selected, setSelected] = useState(null)
  const [severidad, setSeveridad] = useState('leve')
  const [zonas, setZonas] = useState([])
  const [vinculada, setVinculada] = useState(null)
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState(null)
  const [limpio, setLimpio] = useState(null)
  const [resetKey, setResetKey] = useState(0)

  const esDolorCabeza = ES_DOLOR_CABEZA.test(selected?.nombre || '')

  const candidatos = useLiveQuery(async () => {
    const [tipos, reacciones] = await Promise.all([db.tipos.toArray(), db.reacciones.toArray()])
    const usados = new Set(reacciones.map((r) => r.tipo_reaccion_id))
    const canonPorNombre = new Map()
    for (const t of tipos) if (t.es_predefinida) canonPorNombre.set(t.nombre.trim().toLowerCase(), t)
    return tipos
      .filter((t) => {
        if (t.es_predefinida) return false
        const canon = canonPorNombre.get(t.nombre.trim().toLowerCase())
        return (canon && canon.id !== t.id) || !usados.has(t.id)
      })
      .map((t) => t.nombre)
  }, [userId]) || []

  const limpiarSinUso = async () => {
    const tipos = await db.tipos.toArray()
    const reacciones = await db.reacciones.toArray()
    const porTipo = new Map()
    for (const r of reacciones) {
      if (!porTipo.has(r.tipo_reaccion_id)) porTipo.set(r.tipo_reaccion_id, [])
      porTipo.get(r.tipo_reaccion_id).push(r)
    }
    const canonPorNombre = new Map()
    for (const t of tipos) if (t.es_predefinida) canonPorNombre.set(t.nombre.trim().toLowerCase(), t)
    const reportes = []
    for (const t of tipos) {
      if (t.es_predefinida) continue
      const canon = canonPorNombre.get(t.nombre.trim().toLowerCase())
      const propias = porTipo.get(t.id) || []
      if (canon && canon.id !== t.id) {
        for (const r of propias) {
          await db.reacciones.put({ ...r, tipo_reaccion_id: canon.id, _sync: 'pending' })
        }
        await db.pendingDeletes.add({ tableName: 'tipos', id: t.id, usuarioId: userId })
        await db.tipos.delete(t.id)
        reportes.push(`${t.nombre} → estándar (${propias.length} ${propias.length === 1 ? 'malestar movido' : 'malestares movidos'})`)
      } else if (propias.length === 0) {
        await db.pendingDeletes.add({ tableName: 'tipos', id: t.id, usuarioId: userId })
        await db.tipos.delete(t.id)
        reportes.push(`${t.nombre} (eliminado, sin uso)`)
      }
    }
    if (reportes.length === 0) {
      setLimpio('Nada que limpiar.')
      return
    }
    setLimpio(`Hecho: ${reportes.join(' · ')}`)
  }

  const comidasRecientes = useLiveQuery(async () => {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const mañana = new Date(hoy)
    mañana.setDate(mañana.getDate() + 1)

    const registros = await db.registros
      .where('fecha_hora')
      .between(hoy.toISOString(), mañana.toISOString())
      .filter((r) => r.usuario_id === userId)
      .sortBy('fecha_hora')

    const comidas = await db.comidas.bulkGet(registros.map((r) => r.comida_id))
    const nombrePorId = new Map((comidas.filter(Boolean)).map((c) => [c.id, c.nombre]))

    return registros
      .map((r) => ({
        ...r,
        nombre: nombrePorId.get(r.comida_id) || 'Comida',
        hora: new Date(r.fecha_hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      }))
      .reverse()
  }, [userId]) || []

  const select = (item) => {
    setSelected(item)
    setZonas([])
    setSaved(null)
  }

  const createTipo = async (nombre) => {
    const tipo = {
      id: crypto.randomUUID(),
      nombre,
      es_predefinida: false,
      usuario_id: userId,
      _sync: 'pending'
    }
    setSelected(tipo)
    setZonas([])
    await db.tipos.put(tipo)
    return tipo
  }

  const alternarZona = (code) => {
    setZonas((prev) => (prev.includes(code) ? prev.filter((z) => z !== code) : [...prev, code]))
  }

  const guardar = async () => {
    if (!selected) return
    try {
      const reaccion = {
        id: crypto.randomUUID(),
        tipo_reaccion_id: selected.id,
        registro_comida_id: vinculada ? vinculada.id : null,
        fecha_hora: new Date().toISOString(),
        severidad,
        zonas: esDolorCabeza ? zonas : [],
        usuario_id: userId,
        _sync: 'pending'
      }
      await db.reacciones.put(reaccion)
      setSaved({
        nombre: selected.nombre,
        hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        vinculada: vinculada ? true : false,
        zonas: esDolorCabeza ? zonas.length : 0
      })
      setSelected(null)
      setVinculada(null)
      setSeveridad('leve')
      setZonas([])
      setResetKey((k) => k + 1)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
          <Icon path={mdiPill} size={1.2} className="text-white" />
        </div>
        <div>
          <h2 className="font-bold text-base leading-tight">¿Cómo te sientes?</h2>
          <p className="text-xs text-muted">Añade una reacción, asociada o no a una comida</p>
        </div>
      </div>

      <Autocomplete
        key={resetKey}
        tableName="tipos"
        searchFields={CAMPOS}
        placeholder="Ej: Dolor de estómago, Náuseas, Hinchazón⬦"
        value={selected}
        onSelect={select}
        onCreate={createTipo}
        icon={mdiMagnify}
      />

      {selected && esDolorCabeza && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-muted mb-1.5 flex items-center gap-1">
            <Icon path={mdiHead} size={0.8} /> Zonas donde te duele
            <span className="font-normal">(opcional)</span>
          </div>
          <div className="bg-[#0c1830] border border-rose-500/20 rounded-xl p-3">
            <HeadMap zonas={zonas} onToggle={alternarZona} />
            <p className="text-center text-[11px] text-slate-500 mt-2">
              Toca las zonas donde te duele{zonas.length > 0 ? ` · ${zonas.length} marcada${zonas.length === 1 ? '' : 's'}` : ''}
            </p>
          </div>
        </div>
      )}

      {selected && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-muted mb-1.5 flex items-center gap-1">
            <Icon path={mdiAlertCircleOutline} size={0.8} /> Severidad
          </div>
          <div className="flex gap-2">
            {SEVERIDADES.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`severidad-btn ${s.cls} ${severidad === s.key ? 'severidad-active' : ''}`}
                onClick={() => setSeveridad(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3">
        <div className="text-xs font-semibold text-muted mb-1.5 flex items-center gap-1">
          <Icon path={mdiLinkVariant} size={0.8} /> Asociar a una comida de hoy
          <span className="font-normal">(opcional)</span>
        </div>
        {comidasRecientes.length === 0 ? (
          <div className="text-xs text-muted flex items-center gap-1">
            <Icon path={mdiClockOutline} size={0.7} /> Sin comidas registradas hoy.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {comidasRecientes.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`severidad-btn bg-slate-800 text-slate-300 ${vinculada?.id === r.id ? 'severidad-active !border-current !text-violet-300' : ''}`}
                onClick={() => setVinculada(vinculada?.id === r.id ? null : r)}
              >
                {vinculada?.id === r.id
                  ? <Icon path={mdiLinkVariant} size={0.7} />
                  : <Icon path={mdiLinkOff} size={0.7} />}
                {r.nombre}{r.cantidad > 1 && <b> ×{r.cantidad}</b>} · {r.hora}
              </button>
            ))}
          </div>
        )}
      </div>

      {saved && (
        <div className="mt-3 flex items-center gap-2 text-sm text-violet-300 bg-violet-500/10 border border-violet-500/30 rounded-xl p-2.5 animate-fade-up">
          <Icon path={mdiCheckCircle} size={1} className="text-violet-500 shrink-0" />
          <span>
            <b>{saved.nombre}</b> {saved.hora} {saved.vinculada && '· asociada a comida'}{saved.zonas > 0 && ` · ${saved.zonas} ${saved.zonas === 1 ? 'zona marcada' : 'zonas marcadas'}`}
          </span>
        </div>
      )}
      {error && <div className="mt-3 text-sm text-red-700">{error}</div>}

      {candidatos.length > 0 && (
        <button
          type="button"
          onClick={limpiarSinUso}
          className="btn-secondary mt-3 w-full py-2.5 flex items-center justify-center gap-2"
          title="Limpieza temporal"
        >
          <Icon path={mdiDeleteOutline} size={1} className="text-rose-400" />
          <span className="text-rose-300">Limpieza temporal: corregir malestares sin uso o duplicados ({candidatos.length})</span>
        </button>
      )}
      {limpio && (
        <div className="mt-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2.5">
          {limpio}
        </div>
      )}

      <button onClick={guardar} disabled={!selected} className="btn-primary mt-3 w-full py-2.5 flex items-center justify-center gap-2 !bg-gradient-to-br !from-violet-500 !to-purple-600 !shadow-violet-500/30">
        <Icon path={mdiPlus} size={1} />
        {selected ? `Registrar ${selected.nombre}` : 'Registrar reacción'}
      </button>
    </div>
  )
}