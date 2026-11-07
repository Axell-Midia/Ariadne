import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db.js'
import Icon from './Icon.jsx'
import {
  mdiNoteTextOutline, mdiCheckCircle, mdiPlus, mdiPencilOutline,
  mdiDeleteOutline, mdiClockOutline, mdiCheck, mdiClose, mdiInbox
} from '@mdi/js'

export default function Notas({ userId }) {
  const [texto, setTexto] = useState('')
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState(null)
  const [editandoId, setEditandoId] = useState(null)
  const [borrador, setBorrador] = useState('')

  const notas = useLiveQuery(
    () => db.notas.where('usuario_id').equals(userId).sortBy('fecha_hora'),
    [userId]
  ) || []

  const guardar = async () => {
    const contenido = texto.trim()
    if (!contenido) return
    try {
      const nota = {
        id: crypto.randomUUID(),
        contenido,
        fecha_hora: new Date().toISOString(),
        usuario_id: userId,
        _sync: 'pending'
      }
      await db.notas.put(nota)
      setTexto('')
      setSaved({
        hora: new Date(nota.fecha_hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      })
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }

  const iniciarEdicion = (nota) => {
    setEditandoId(nota.id)
    setBorrador(nota.contenido)
  }

  const guardarEdicion = async (nota) => {
    const contenido = borrador.trim()
    if (!contenido) return
    try {
      await db.notas.put({ ...nota, contenido, _sync: 'pending' })
      setEditandoId(null)
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }

  const eliminar = async (nota) => {
    if (!confirm('¿Eliminar esta nota?')) return
    try {
      await db.pendingDeletes.add({ tableName: 'notas', id: nota.id, usuarioId: userId })
      await db.notas.delete(nota.id)
    } catch (e) {
      setError(e.message)
    }
  }

  const grupos = new Map()
  for (const n of notas) {
    const d = new Date(n.fecha_hora)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!grupos.has(key)) grupos.set(key, [])
    grupos.get(key).push(n)
  }

  const dayLabel = (key) => {
    const hoy = new Date()
    const ayer = new Date(hoy)
    ayer.setDate(ayer.getDate() - 1)
    const fechaKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (key === fechaKey(hoy)) return 'Hoy'
    if (key === fechaKey(ayer)) return 'Ayer'
    const d = new Date(key)
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  return (
    <div className="card animate-fade-up">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-400 to-cyan-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
          <Icon path={mdiNoteTextOutline} size={1.2} className="text-white" />
        </div>
        <div>
          <h2 className="font-bold text-base leading-tight">Notas del día</h2>
          <p className="text-xs text-muted">Escribe lo que quieras recordar · la hora se guarda sola</p>
        </div>
      </div>

      <div className="relative">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          placeholder="Ej: Dolor de cabeza todo el día⬦"
          className="resize-none pr-10"
        />
        <button
          onClick={guardar}
          disabled={!texto.trim()}
          title="Guardar nota"
          className="btn-primary !p-2 !rounded-xl absolute right-2 bottom-2"
        >
          <Icon path={mdiPlus} size={1.05} />
        </button>
      </div>

      <p className="text-[11px] text-muted mt-1.5 flex items-center gap-1">
        <Icon path={mdiClockOutline} size={0.7} />
        Se guardará con la fecha y hora de este momento.
      </p>

      {saved && (
        <div className="mt-3 flex items-center gap-2 text-sm text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-2.5 animate-fade-up">
          <Icon path={mdiCheckCircle} size={1} className="text-cyan-400 shrink-0" />
          <span>Nota guardada a las <b>{saved.hora}</b></span>
        </div>
      )}
      {error && (
        <div className="mt-3 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-2.5">{error}</div>
      )}

      <div className="mt-5 space-y-5">
        {notas.length === 0 ? (
          <div className="text-center py-8 text-muted">
            <Icon path={mdiInbox} size={2.2} className="mx-auto mb-3 text-cyan-400/70" />
            <p className="font-medium">Tu día todavía está en blanco.</p>
            <p className="text-sm">Añade la primera nota arriba.</p>
          </div>
        ) : (
          [...grupos.entries()].reverse().map(([key, entries]) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2">
                <span className="date-chip text-cyan-300">
                  <Icon path={mdiNoteTextOutline} size={0.8} />
                  {dayLabel(key)}
                  <span className="text-slate-400 font-semibold">{entries.length}</span>
                </span>
              </div>
              <div className="space-y-2">
                {entries.map((n) => (
                  <div key={n.id} className="relative group">
                    {editandoId === n.id ? (
                      <div className="bg-[#0e1a30] border border-cyan-500/30 rounded-xl p-2.5 space-y-2">
                        <textarea
                          value={borrador}
                          onChange={(e) => setBorrador(e.target.value)}
                          rows={2}
                          autoFocus
                          className="resize-none"
                        />
                        <div className="flex items-center gap-2">
                          <button onClick={() => guardarEdicion(n)} disabled={!borrador.trim()} className="btn-primary !py-1.5 flex items-center gap-1.5">
                            <Icon path={mdiCheck} size={0.85} /> Guardar
                          </button>
                          <button onClick={() => setEditandoId(null)} className="btn-secondary !py-1.5 flex items-center gap-1.5">
                            <Icon path={mdiClose} size={0.85} /> Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 bg-[#0e1a30]/70 hover:bg-[#122140] rounded-xl p-2.5 border border-transparent hover:border-slate-700 transition-all">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm whitespace-pre-wrap break-words">{n.contenido}</p>
                          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                            <Icon path={mdiClockOutline} size={0.6} />
                            {new Date(n.fecha_hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => iniciarEdicion(n)} className="text-slate-400 hover:text-cyan-400 transition-colors p-1" title="Editar">
                            <Icon path={mdiPencilOutline} size={0.9} />
                          </button>
                          <button onClick={() => eliminar(n)} className="text-slate-400 hover:text-rose-400 transition-colors p-1" title="Eliminar">
                            <Icon path={mdiDeleteOutline} size={0.9} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}