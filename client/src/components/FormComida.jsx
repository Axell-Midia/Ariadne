import { useState } from 'react'
import Autocomplete from './Autocomplete.jsx'
import { db } from '../lib/db.js'
import Icon from './Icon.jsx'
import { mdiSilverwareForkKnife, mdiCheckCircle, mdiPlus, mdiMinus, mdiMagnify } from '@mdi/js'

const CAMPOS = ['nombre']

export default function FormComida({ userId }) {
  const [selected, setSelected] = useState(null)
  const [cantidad, setCantidad] = useState(1)
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState(null)
  const [resetKey, setResetKey] = useState(0)

  const select = (item) => {
    setSelected(item)
    setCantidad(1)
    setSaved(null)
  }

  const createComida = async (nombre) => {
    const comida = {
      id: crypto.randomUUID(),
      nombre,
      usuario_id: userId,
      created_at: new Date().toISOString(),
      _sync: 'pending'
    }
    setSelected(comida)
    await db.comidas.put(comida)
    return comida
  }

  const guardar = async () => {
    if (!selected) return
    try {
      const registro = {
        id: crypto.randomUUID(),
        comida_id: selected.id,
        cantidad: cantidad || 1,
        fecha_hora: new Date().toISOString(),
        usuario_id: userId,
        _sync: 'pending'
      }
      await db.registros.put(registro)
      setSaved({
        nombre: selected.nombre,
        cantidad: cantidad || 1,
        hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      })
      setSelected(null)
      setCantidad(1)
      setResetKey((k) => k + 1)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
          <Icon path={mdiSilverwareForkKnife} size={1.2} className="text-white" />
        </div>
        <div>
          <h2 className="font-bold text-base leading-tight">¿Qué comiste?</h2>
          <p className="text-xs text-muted">Autocompleta o crea un alimento · la hora se guarda sola</p>
        </div>
      </div>

      <Autocomplete
        key={resetKey}
        tableName="comidas"
        searchFields={CAMPOS}
        placeholder="Ej: Café con leche, Arroz con pollo⬦"
        value={selected}
        onSelect={select}
        onCreate={createComida}
        icon={mdiMagnify}
      />

      {saved && (
        <div className="mt-3 flex items-center gap-2 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2.5 animate-fade-up">
          <Icon path={mdiCheckCircle} size={1} className="text-emerald-500 shrink-0" />
          <span>
            <b>{saved.nombre}</b>{saved.cantidad > 1 && <b> ×{saved.cantidad}</b>} registrado a las <b>{saved.hora}</b>
          </span>
        </div>
      )}
      {error && <div className="mt-3 text-sm text-red-700">{error}</div>}

      {selected && (
        <div className="mt-3 flex items-center justify-between gap-2 bg-[#0e1a30]/70 rounded-xl p-2.5 border border-line/50">
          <div className="text-sm text-slate-300">
            Cantidad
            <span className="block text-[11px] text-muted">{selected.nombre}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              disabled={cantidad <= 1}
              className="w-9 h-9 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 font-bold flex items-center justify-center transition-colors"
              title="Disminuir cantidad"
              aria-label="Disminuir cantidad"
            >
              <Icon path={mdiMinus} size={0.9} />
            </button>
            <span className="w-11 text-center font-bold text-emerald-300 text-lg" data-cantidad>{cantidad}</span>
            <button
              onClick={() => setCantidad((c) => Math.min(50, c + 1))}
              className="w-9 h-9 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold flex items-center justify-center transition-colors"
              title="Aumentar cantidad"
              aria-label="Aumentar cantidad"
            >
              <Icon path={mdiPlus} size={0.9} />
            </button>
          </div>
        </div>
      )}

      <button onClick={guardar} disabled={!selected} className="btn-primary mt-3 w-full py-2.5 flex items-center justify-center gap-2">
        <Icon path={mdiPlus} size={1} />
        {selected ? `Registrar ${selected.nombre}` : 'Registrar comida'}
      </button>
    </div>
  )
}