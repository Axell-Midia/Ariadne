import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useFranja, sugerencias } from '../lib/sugerencias.js'
import { db } from '../lib/db.js'
import Icon from './Icon.jsx'
import {
  mdiLightningBoltOutline, mdiSilverwareForkKnife, mdiPill,
  mdiCheckCircle, mdiClockOutline
} from '@mdi/js'

export default function ChipsRapidos({ userId }) {
  const [flash, setFlash] = useState(null)
  const [cool, setCool] = useState({})
  const franja = useFranja()

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 3200)
    return () => clearTimeout(t)
  }, [flash])

  const sug = useLiveQuery(() => sugerencias(userId, franja), [userId, franja])

  if (!sug || (sug.comidas.length === 0 && sug.reacciones.length === 0)) return null

  const registrarComida = async (comida) => {
    if (cool[comida.id]) return
    setCool((c) => ({ ...c, [comida.id]: true }))
    const hora = new Date()
    await db.registros.put({
      id: crypto.randomUUID(),
      comida_id: comida.id,
      cantidad: 1,
      fecha_hora: hora.toISOString(),
      usuario_id: userId,
      _sync: 'pending'
    })
    setFlash({ nombre: comida.nombre, hora })
  }

  const registrarReaccion = async (tipo) => {
    if (cool[tipo.id]) return
    setCool((c) => ({ ...c, [tipo.id]: true }))
    const hora = new Date()
    await db.reacciones.put({
      id: crypto.randomUUID(),
      tipo_reaccion_id: tipo.id,
      registro_comida_id: null,
      fecha_hora: hora.toISOString(),
      severidad: 'leve',
      zonas: [],
      usuario_id: userId,
      _sync: 'pending'
    })
    setFlash({ nombre: tipo.nombre, hora })
  }

  const hhmm = (d) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
          <Icon path={mdiLightningBoltOutline} size={1.2} className="text-white" />
        </div>
        <div>
          <h2 className="font-bold text-base leading-tight">Registro rápido</h2>
          <p className="text-xs text-muted flex items-center gap-1">
            <Icon path={mdiClockOutline} size={0.7} /> A las {hhmm(new Date())} sueles registrar… · un toque y listo
          </p>
        </div>
      </div>

      {sug.comidas.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-muted mb-1.5 flex items-center gap-1">
            <Icon path={mdiSilverwareForkKnife} size={0.8} /> Comidas habituales a esta hora
          </div>
          <div className="flex flex-wrap gap-2">
            {sug.comidas.map((c) => (
              <button
                key={c.id}
                onClick={() => registrarComida(c)}
                disabled={!!cool[c.id]}
                className="severidad-btn severidad-leve !text-[13px] !py-1.5 !px-3"
                title={`Registrar ${c.nombre} ahora`}
              >
                {cool[c.id] ? <Icon path={mdiCheckCircle} size={0.75} /> : <Icon path={mdiSilverwareForkKnife} size={0.7} />}
                {c.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {sug.reacciones.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted mb-1.5 flex items-center gap-1">
            <Icon path={mdiPill} size={0.8} /> Malestares que sueles registrar
          </div>
          <div className="flex flex-wrap gap-2">
            {sug.reacciones.map((r) => (
              <button
                key={r.id}
                onClick={() => registrarReaccion(r)}
                disabled={!!cool[r.id]}
                className="severidad-btn severidad-moderada !text-[13px] !py-1.5 !px-3"
                title={`Registrar ${r.nombre} ahora`}
              >
                {cool[r.id] ? <Icon path={mdiCheckCircle} size={0.75} /> : <Icon path={mdiPill} size={0.7} />}
                {r.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {flash && (
        <div className="mt-3 flex items-center gap-2 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2.5 animate-fade-up">
          <Icon path={mdiCheckCircle} size={1} className="text-emerald-500 shrink-0" />
          <span>
            <b>{flash.nombre}</b> registrado a las <b>{hhmm(flash.hora)}</b>
          </span>
        </div>
      )}
    </div>
  )
}
