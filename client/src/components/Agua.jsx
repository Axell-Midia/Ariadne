import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db.js'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import {
  mdiCupWater, mdiWaterOutline, mdiCheckCircle, mdiCheck, mdiClose,
  mdiPencilOutline, mdiDeleteOutline, mdiClockOutline, mdiInbox, mdiTrophyOutline,
  mdiPlus
} from '@mdi/js'

const META = 8
const ML = 250

function inicioDeHoy() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function aValorLocal(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function Agua({ userId }) {
  const [editando, setEditando] = useState(null)
  const [editHora, setEditHora] = useState('')
  const [editTipo, setEditTipo] = useState('')
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState(null)

  const vasos = useLiveQuery(
    async () => {
      const inicio = inicioDeHoy()
      const fin = new Date(inicio.getTime() + 86400000)
      const hoy = await db.vasos
        .where('fecha_hora')
        .between(inicio.toISOString(), fin.toISOString())
        .filter((v) => v.usuario_id === userId)
        .sortBy('fecha_hora')
      return hoy.map((v, i) => ({ ...v, num: i + 1 }))
    },
    [userId]
  ) || []

  const contar = vasos.length
  const llenos = Math.min(contar, META)
  const extra = contar > META ? contar - META : 0

  const mostrarSaved = (fecha) => {
    setSaved({ hora: new Date(fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) })
    setTimeout(() => setSaved(null), 2500)
  }

  const llenarVaso = async () => {
    try {
      const fecha = new Date().toISOString()
      await db.vasos.put({
        id: crypto.randomUUID(),
        usuario_id: userId,
        fecha_hora: fecha,
        tipo: null,
        _sync: 'pending'
      })
      mostrarSaved(fecha)
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }

  const vaciarVaso = async (vaso) => {
    try {
      if (editando?.id === vaso.id) setEditando(null)
      await db.pendingDeletes.add({ tableName: 'vasos', id: vaso.id, usuarioId: userId })
      await db.vasos.delete(vaso.id)
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }

  const abrirEditor = (vaso) => {
    setEditando(vaso)
    setEditHora(aValorLocal(vaso.fecha_hora))
    setEditTipo(vaso.tipo || '')
    setError(null)
  }

  const guardarEdicion = async () => {
    if (!editando) return
    try {
      const nuevaFecha = editHora ? new Date(editHora) : new Date(editando.fecha_hora)
      await db.vasos.put({
        id: editando.id,
        usuario_id: userId,
        fecha_hora: isNaN(nuevaFecha) ? editando.fecha_hora : nuevaFecha.toISOString(),
        tipo: editTipo.trim() || null,
        _sync: 'pending'
      })
      setEditando(null)
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }

  const hora = (f) => new Date(f).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="card animate-fade-up">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/30">
          <Icon path={mdiCupWater} size={1.2} className="text-white" />
        </div>
        <div>
          <h2 className="font-bold text-base leading-tight">Agua del día</h2>
          <p className="text-xs text-muted">Toca un vaso para rellenarlo · toca uno lleno para editarlo · cada uno ≈ {ML} ml</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="date-chip text-sky-300">
          <Icon path={mdiCupWater} size={0.8} />
          {contar} / {META} vasos
          <span className="text-slate-400 font-semibold">{contar * ML} ml</span>
        </span>
        {extra > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-full px-2.5 py-1">
            <Icon path={mdiTrophyOutline} size={0.8} /> +{extra} sobre la meta
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        {Array.from({ length: META }).map((_, i) => {
          const lleno = i < llenos
          const vaso = lleno ? vasos[i] : null
          return (
            <button
              key={i}
              onClick={lleno ? () => abrirEditor(vaso) : llenarVaso}
              title={lleno ? `Vaso ${i + 1} · ${hora(vaso.fecha_hora)} (clic para editar)` : `Rellenar vaso ${i + 1}`}
              className={[
                'aspect-square rounded-2xl border flex items-center justify-center transition-all',
                lleno
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.35)] hover:bg-sky-500/25'
                  : 'bg-slate-800/40 border-line text-slate-600 hover:text-sky-300 hover:border-sky-500/40'
              ].join(' ')}
            >
              <Icon path={lleno ? mdiCupWater : mdiWaterOutline} size={1.15} />
            </button>
          )
        })}
        {contar >= META && (
          <button
            onClick={llenarVaso}
            title="Agregar un vaso extra"
            className="aspect-square rounded-2xl border border-dashed border-sky-500/40 text-sky-400/70 hover:text-sky-300 hover:border-sky-500/70 flex items-center justify-center transition-all"
          >
            <Icon path={mdiPlus} size={1.15} />
          </button>
        )}
      </div>

      {saved && (
        <div className="mt-3 flex items-center gap-2 text-sm text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-xl p-2.5 animate-fade-up">
          <Icon path={mdiCheckCircle} size={1} className="text-sky-400 shrink-0" />
          <span>Vaso rellenado a las <b>{saved.hora}</b></span>
        </div>
      )}
      {error && (
        <div className="mt-3 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-2.5">{error}</div>
      )}

      <div className="mt-5">
        <div className="text-xs font-semibold text-muted mb-2">Vasos de hoy</div>
        {vasos.length === 0 ? (
          <div className="text-center py-6 text-muted">
            <Icon path={mdiInbox} size={1.8} className="mx-auto mb-2 text-sky-400/70" />
            <p className="text-sm">Aún no has tomado agua hoy. Toca un vaso para empezar.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {vasos.map((v) => (
              <div key={v.id} className="flex items-center gap-3 bg-[#0e1a30]/70 hover:bg-[#122140] rounded-xl p-2.5 border border-transparent hover:border-slate-700 transition-all">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${v.tipo ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-800 text-slate-500'}`}>
                  <Icon path={mdiCupWater} size={0.9} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">Vaso {v.num}</div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Icon path={mdiClockOutline} size={0.6} />
                    {hora(v.fecha_hora)}
                    {v.tipo && <span className="text-sky-300 truncate">· {v.tipo}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => abrirEditor(v)} className="text-slate-400 hover:text-sky-400 transition-colors p-1" title="Editar hora o tipo">
                    <Icon path={mdiPencilOutline} size={0.9} />
                  </button>
                  <button onClick={() => vaciarVaso(v)} className="text-slate-400 hover:text-rose-400 transition-colors p-1" title="Vaciar">
                    <Icon path={mdiDeleteOutline} size={0.9} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editando && (
        <Modal onClose={() => setEditando(null)} title={`Editar vaso ${editando.num}`}>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted flex items-center gap-1 mb-1.5">
                <Icon path={mdiClockOutline} size={0.8} /> Hora
              </label>
              <input
                type="datetime-local"
                value={editHora}
                onChange={(e) => setEditHora(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">Tipo de agua <span className="font-normal">(opcional)</span></label>
              <input
                type="text"
                value={editTipo}
                onChange={(e) => setEditTipo(e.target.value)}
                placeholder="Ej: con limón, gasificada, té…"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={guardarEdicion} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <Icon path={mdiCheck} size={0.9} /> Guardar
              </button>
              <button
                onClick={() => vaciarVaso(editando)}
                className="btn-danger flex items-center justify-center gap-2"
                title="Borrar vaso"
              >
                <Icon path={mdiDeleteOutline} size={0.9} />
              </button>
              <button onClick={() => setEditando(null)} className="btn-secondary flex items-center justify-center gap-2">
                <Icon path={mdiClose} size={0.9} />
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
