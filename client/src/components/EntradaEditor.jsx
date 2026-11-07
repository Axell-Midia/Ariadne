import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import Autocomplete from './Autocomplete.jsx'
import Modal from './Modal.jsx'
import HeadMap from './HeadMap.jsx'
import { db } from '../lib/db.js'
import { zonaLabels } from '../lib/zonas.js'
import { ES_DOLOR_CABEZA } from '../lib/zonas.js'
import Icon from './Icon.jsx'
import {
  mdiMagnify, mdiPill, mdiMinus, mdiPlus, mdiLinkVariant, mdiLinkOff, mdiClockOutline
} from '@mdi/js'

const MAX_CANTIDAD = 50

const toLocalInput = (d) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const stepperBtn = 'w-9 h-9 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 font-bold flex items-center justify-center transition-colors'

export default function EntradaEditor({ userId, entry, comidas, tipos, onClose }) {
  const esComida = entry.kind === 'comida'
  const [comida, setComida] = useState(esComida ? (comidas.find((c) => c.id === entry.comida_id) || null) : null)
  const [tipo, setTipo] = useState(!esComida ? (tipos.find((t) => t.id === entry.tipo_reaccion_id) || null) : null)
  const [cantidad, setCantidad] = useState(esComida ? entry.cantidad : 1)
  const [fecha, setFecha] = useState(toLocalInput(entry.fecha))
  const [vinculadaId, setVinculadaId] = useState(entry.vinculadaId || null)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const dia = fecha.slice(0, 10)

  const comidasDia = useLiveQuery(async () => {
    if (esComida || !dia) return []
    const inicio = new Date(`${dia}T00:00:00`)
    const fin = new Date(`${dia}T23:59:59.999`)
    const registros = await db.registros
      .filter((r) => {
        const d = new Date(r.fecha_hora)
        return d >= inicio && d <= fin && r.usuario_id === userId
      })
      .sortBy('fecha_hora')
    const listaComidas = await db.comidas.bulkGet(registros.map((r) => r.comida_id))
    const nombrePorId = new Map(listaComidas.filter(Boolean).map((c) => [c.id, c.nombre]))
    return registros.map((r) => ({
      ...r,
      nombre: nombrePorId.get(r.comida_id) || 'Comida',
      hora: new Date(r.fecha_hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    }))
  }, [userId, dia, esComida]) || []

  const esCabeza = ES_DOLOR_CABEZA.test(tipo?.nombre || '')
  const listoParaGuardar = esComida ? !!comida && !!fecha : !!tipo && !!fecha

  const crearComida = async (nombre) => {
    const item = { id: crypto.randomUUID(), nombre, usuario_id: userId, created_at: new Date().toISOString(), _sync: 'pending' }
    setComida(item)
    await db.comidas.put(item)
    return item
  }

  const crearTipo = async (nombre) => {
    const item = { id: crypto.randomUUID(), nombre, es_predefinida: false, usuario_id: userId, _sync: 'pending' }
    setTipo(item)
    await db.tipos.put(item)
    return item
  }

  const guardar = async () => {
    if (!listoParaGuardar) return
    setGuardando(true)
    setError(null)
    try {
      const fechaISO = new Date(fecha).toISOString()
      if (esComida) {
        await db.registros.put({
          id: entry.id,
          comida_id: comida.id,
          cantidad: cantidad || 1,
          fecha_hora: fechaISO,
          usuario_id: userId,
          _sync: 'pending'
        })
      } else {
        const zonas = esCabeza ? (entry.zonas || []) : []
        await db.reacciones.put({
          id: entry.id,
          tipo_reaccion_id: tipo.id,
          registro_comida_id: vinculadaId || null,
          fecha_hora: fechaISO,
          severidad: entry.severidad,
          zonas,
          usuario_id: userId,
          _sync: 'pending'
        })
      }
      onClose()
    } catch (e) {
      setError(e.message)
      setGuardando(false)
    }
  }

  return (
    <Modal onClose={onClose} title={esComida ? 'Editar comida' : 'Editar malestar'}
      footer={
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5">Cancelar</button>
          <button type="button" onClick={guardar} disabled={!listoParaGuardar} className="btn-primary flex-1 py-2.5">
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      }>
      <div className="space-y-4">
        {esComida ? (
          <>
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">Comida</label>
              <Autocomplete
                tableName="comidas"
                searchFields={['nombre']}
                placeholder="Ej: Pan, Café con leche⬦"
                value={comida}
                onSelect={setComida}
                onCreate={crearComida}
                icon={mdiMagnify}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">Cantidad</label>
              <div className="flex items-center justify-between bg-[#0e1a30]/70 rounded-xl p-2.5 border border-line/50">
                <span className="text-sm text-slate-300">{comida?.nombre || 'Alimento'}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                    disabled={cantidad <= 1}
                    className={stepperBtn}
                    title="Disminuir cantidad"
                    aria-label="Disminuir cantidad"
                  >
                    <Icon path={mdiMinus} size={0.9} />
                  </button>
                  <span className="w-11 text-center font-bold text-emerald-300 text-lg" data-cantidad>{cantidad}</span>
                  <button
                    type="button"
                    onClick={() => setCantidad((c) => Math.min(MAX_CANTIDAD, c + 1))}
                    className={stepperBtn}
                    title="Aumentar cantidad"
                    aria-label="Aumentar cantidad"
                  >
                    <Icon path={mdiPlus} size={0.9} />
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">Malestar</label>
              <Autocomplete
                tableName="tipos"
                searchFields={['nombre']}
                placeholder="Ej: Dolor de estómago⬦"
                value={tipo}
                onSelect={setTipo}
                onCreate={crearTipo}
                icon={mdiPill}
              />
              {entry.zonas?.length > 0 && !esCabeza && (
                <p className="text-[11px] text-rose-300 mt-1.5">Al guardar se quitarán las zonas marcadas (no es un dolor de cabeza).</p>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold text-muted mb-1.5 flex items-center gap-1">
                <Icon path={mdiLinkVariant} size={0.8} /> Asociar a una comida de ese día
                <span className="font-normal">(opcional)</span>
              </div>
              {comidasDia.length === 0 ? (
                <div className="text-xs text-muted flex items-center gap-1">
                  <Icon path={mdiClockOutline} size={0.7} /> Sin comidas registradas ese día.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {comidasDia.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={`severidad-btn bg-slate-800 text-slate-300 ${vinculadaId === r.id ? 'severidad-active !border-current !text-violet-300' : ''}`}
                      onClick={() => setVinculadaId(vinculadaId === r.id ? null : r.id)}
                    >
                      {vinculadaId === r.id ? <Icon path={mdiLinkVariant} size={0.7} /> : <Icon path={mdiLinkOff} size={0.7} />}
                      {r.nombre}{r.cantidad > 1 && <b> ×{r.cantidad}</b>} · {r.hora}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <div>
          <label className="text-xs font-semibold text-muted mb-1.5 block">Día y hora</label>
          <input
            type="datetime-local"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full"
          />
        </div>

        {!esComida && esCabeza && entry.zonas?.length > 0 && (
          <div className="flex items-start gap-3 bg-[#0e1a30]/70 rounded-xl p-2.5 border border-line/50">
            <div className="w-24 shrink-0"><HeadMap zonas={entry.zonas} compact /></div>
            <p className="text-xs text-slate-400 leading-relaxed pt-0.5">
              Zonas: {zonaLabels(entry.zonas).join(', ')}
            </p>
          </div>
        )}

        {error && <div className="text-sm text-red-700">{error}</div>}
      </div>
    </Modal>
  )
}