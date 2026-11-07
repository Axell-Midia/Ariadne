import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import HeadMap from './HeadMap.jsx'
import EntradaEditor from './EntradaEditor.jsx'
import { db } from '../lib/db.js'
import { zonaLabels } from '../lib/zonas.js'
import Icon from './Icon.jsx'
import {
  mdiSilverwareForkKnife, mdiPill, mdiDeleteOutline, mdiPencilOutline, mdiTimelineOutline, mdiTable,
  mdiFilterVariant, mdiCalendarToday, mdiLinkVariant, mdiInbox, mdiFileExcelOutline, mdiFilePdfBox
} from '@mdi/js'

const SEV_META = {
  leve: { cls: 'bg-emerald-500/20 text-emerald-300', label: 'Leve' },
  moderada: { cls: 'bg-amber-500/20 text-amber-300', label: 'Moderada' },
  fuerte: { cls: 'bg-rose-500/20 text-rose-300', label: 'Fuerte' }
}

export default function Historial({ userId }) {
  const [vista, setVista] = useState('timeline')
  const [filtro, setFiltro] = useState('todas')
  const [editando, setEditando] = useState(null)
  const [exportando, setExportando] = useState(null)

  const exportar = async (formato) => {
    if (exportando) return
    setExportando(formato)
    try {
      const { recolectarHistorial, exportarExcel, exportarPDF } = await import('../lib/exportar.js')
      const datos = await recolectarHistorial(userId)
      if (formato === 'excel') exportarExcel(datos)
      else exportarPDF(datos)
    } catch (e) {
      console.error(e)
      alert(`No se pudo exportar: ${e.message}`)
    } finally {
      setExportando(null)
    }
  }

  const datos = useLiveQuery(async () => {
    const [registros, reacciones, comidas, tipos] = await Promise.all([
      db.registros.where('usuario_id').equals(userId).sortBy('fecha_hora'),
      db.reacciones.where('usuario_id').equals(userId).sortBy('fecha_hora'),
      db.comidas.toArray(),
      db.tipos.toArray()
    ])

    const comidaNombre = new Map(comidas.map((c) => [c.id, c.nombre]))
    const tipoNombre = new Map(tipos.map((t) => [t.id, t.nombre]))

    const entries = [
      ...registros.map((r) => ({
        key: `c-${r.id}`,
        fecha: new Date(r.fecha_hora),
        kind: 'comida',
        nombre: comidaNombre.get(r.comida_id) || 'Comida',
        cantidad: r.cantidad || 1,
        comida_id: r.comida_id,
        id: r.id,
        table: 'registros'
      })),
      ...reacciones.map((r) => ({
        key: `r-${r.id}`,
        fecha: new Date(r.fecha_hora),
        kind: 'reaccion',
        nombre: tipoNombre.get(r.tipo_reaccion_id) || 'Reacción',
        severidad: r.severidad,
        zonas: r.zonas || [],
        tipo_reaccion_id: r.tipo_reaccion_id,
        registro_comida_id: r.registro_comida_id,
        vinculadaId: r.registro_comida_id || null,
        vinculada: r.registro_comida_id
          ? comidaNombre.get(registros.find((re) => re.id === r.registro_comida_id)?.comida_id) || 'Comida'
          : null,
        id: r.id,
        table: 'reacciones'
      }))
    ]

    const sorted = entries.sort((a, b) => a.fecha - b.fecha)
    const grupos = new Map()
    for (const e of sorted) {
      const d = e.fecha
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!grupos.has(key)) grupos.set(key, [])
      grupos.get(key).push(e)
    }
    return { registros, reacciones, grupos, comidas, tipos }
  }, [userId]) || { registros: [], reacciones: [], grupos: new Map(), comidas: [], tipos: [] }

  const total = datos.registros.length + datos.reacciones.length
  const filtrados = new Map([...datos.grupos].map(([k, v]) => [k, v.filter((e) => (filtro === 'todas') || e.kind === filtro)]))

  const eliminar = async (e) => {
    if (!confirm(`¿Eliminar "${e.nombre}"?`)) return
    if (e.table === 'registros') {
      const linked = await db.reacciones.where('registro_comida_id').equals(e.id).toArray()
      for (const l of linked) {
        await db.pendingDeletes.add({ tableName: 'reacciones', id: l.id, usuarioId: userId })
        await db.reacciones.delete(l.id)
      }
    }
    await db.pendingDeletes.add({ tableName: e.table, id: e.id, usuarioId: userId })
    await db.table(e.table).delete(e.id)
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

  const hora = (f) => f.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="card animate-fade-up">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-bold text-base flex items-center gap-2">
          <Icon path={mdiCalendarToday} size={1.1} className="text-emerald-500" />
          Historial
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => exportar('excel')}
            disabled={!!exportando}
            className="btn-primary !py-2 px-3 flex items-center justify-center gap-1.5 text-sm rounded-xl disabled:opacity-60"
            title="Exportar todo el historial a Excel"
          >
            <Icon path={mdiFileExcelOutline} size={1} />
            {exportando === 'excel' ? 'Generando…' : 'Exportar Excel'}
          </button>
          <button
            onClick={() => exportar('pdf')}
            disabled={!!exportando}
            className="btn-secondary !py-2 px-3 flex items-center justify-center gap-1.5 text-sm rounded-xl disabled:opacity-60"
            title="Exportar todo el historial a PDF"
          >
            <Icon path={mdiFilePdfBox} size={1} className="text-rose-400" />
            {exportando === 'pdf' ? 'Generando…' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      {total > 0 && (
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Icon path={mdiFilterVariant} size={0.9} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="w-auto text-sm py-1.5 pl-9 pr-6 rounded-xl appearance-none">
              <option value="todas">Todo</option>
              <option value="comida">Solo comidas</option>
              <option value="reaccion">Solo reacciones</option>
            </select>
          </div>
          <div className="flex rounded-xl overflow-hidden border border-line bg-[#0c1830] p-0.5">
            <button
              onClick={() => setVista('timeline')}
              className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1.5 ${vista === 'timeline' ? 'bg-slate-800 text-emerald-400 shadow-sm' : 'text-slate-500'}`}
            >
              <Icon path={mdiTimelineOutline} size={0.9} /> Timeline
            </button>
            <button
              onClick={() => setVista('tabla')}
              className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1.5 ${vista === 'tabla' ? 'bg-slate-800 text-emerald-400 shadow-sm' : 'text-slate-500'}`}
            >
              <Icon path={mdiTable} size={0.9} /> Tabla
            </button>
          </div>
        </div>
      </div>
      )}

      {total === 0 ? (
        <div className="text-center py-10 text-muted">
          <Icon path={mdiInbox} size={2.5} className="mx-auto mb-3 text-emerald-400" />
          <p className="font-medium">Aún no hay registros.</p>
          <p className="text-sm">Agrega tu primera comida en la pestaña Registrar.</p>
          <p className="text-xs mt-2">Los botones de exportación siguen disponibles arriba.</p>
        </div>
      ) : vista === 'timeline' ? (
        <div className="space-y-6">
          {[...filtrados.entries()].reverse().map(([key, entries]) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-3">
                <span className="date-chip">
                  <Icon path={mdiCalendarToday} size={0.8} />
                  {dayLabel(key)}
                  <span className="text-slate-400 font-semibold">{entries.length}</span>
                </span>
              </div>
              <div className="relative pl-6 space-y-3 ml-1">
                <div className="absolute left-[7px] top-1 bottom-4 w-0.5 bg-gradient-to-b from-emerald-500/60 via-violet-500/60 to-transparent"></div>
                {entries.map((e) => (
                  <div key={e.key} className="relative group">
                    <div className={`absolute -left-6 top-3 w-4 h-4 rounded-full border-[3px] border-line shadow ${e.kind === 'comida' ? 'bg-emerald-500' : 'bg-violet-500'}`}></div>
                    <div className="flex items-start justify-between gap-2 bg-[#0e1a30]/70 hover:bg-[#122140] rounded-xl p-3 border border-transparent hover:border-slate-700 transition-all" data-entry={e.key}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-400">{hora(e.fecha)}</span>
                          <span className={`pill ${e.kind === 'comida' ? 'pill-comida' : 'pill-reaccion'}`}>
                            <Icon path={e.kind === 'comida' ? mdiSilverwareForkKnife : mdiPill} size={0.65} />
                            {e.kind === 'comida' ? 'Comida' : 'Reacción'}
                          </span>
                        </div>
                        <div className="font-semibold mt-0.5 truncate">
                          {e.nombre}
                          {e.kind === 'comida' && e.cantidad > 1 && (
                            <span className="ml-1.5 text-emerald-300 font-bold">×{e.cantidad}</span>
                          )}
                        </div>
                        {e.kind === 'reaccion' && (
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-full font-bold ${SEV_META[e.severidad]?.cls || 'bg-slate-700 text-slate-300'}`}>
                              {SEV_META[e.severidad]?.label || e.severidad}
                            </span>
                            {e.zonas.length > 0 && (
                              <span className="inline-flex items-center gap-1 text-rose-300">
                                {e.zonas.length} {e.zonas.length === 1 ? 'zona marcada' : 'zonas marcadas'}
                              </span>
                            )}
                            {e.vinculada && (
                              <span className="inline-flex items-center gap-1 text-violet-300">
                                <Icon path={mdiLinkVariant} size={0.7} /> a {e.vinculada}
                              </span>
                            )}
                          </div>
                        )}
                        {e.kind === 'reaccion' && e.zonas.length > 0 && (
                          <div className="mt-2 flex items-start gap-3">
                            <div className="w-24 shrink-0"><HeadMap zonas={e.zonas} compact /></div>
                            <p className="text-xs text-slate-400 leading-relaxed pt-0.5">
                              {zonaLabels(e.zonas).join(', ')}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setEditando(e)}
                          className="text-slate-500 hover:text-emerald-400 transition-colors p-1"
                          title="Editar"
                        >
                          <Icon path={mdiPencilOutline} size={1} />
                        </button>
                        <button
                          onClick={() => eliminar(e)}
                          className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                          title="Eliminar"
                        >
                          <Icon path={mdiDeleteOutline} size={1} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-slate-400">
                <th className="py-2 pr-3 pl-2">Día</th>
                <th className="py-2 pr-3">Hora</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">Detalle</th>
                <th className="py-2 pr-3">Vínculo</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {[...filtrados.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).flatMap(([key, entries]) =>
                entries.map((e) => (
                  <tr key={e.key} className="border-b border-line/60 hover:bg-slate-800/40">
                    <td className="py-2 pr-3 pl-2 capitalize whitespace-nowrap font-medium text-slate-400">{dayLabel(key)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-300">{hora(e.fecha)}</td>
                    <td className="py-2 pr-3">
                      <span className={`pill ${e.kind === 'comida' ? 'pill-comida' : 'pill-reaccion'}`}>
                        <Icon path={e.kind === 'comida' ? mdiSilverwareForkKnife : mdiPill} size={0.65} />
                        {e.kind === 'comida' ? 'Comida' : 'Reacción'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-semibold">
                      {e.nombre}
                      {e.kind === 'comida' && e.cantidad > 1 && (
                        <span className="ml-1.5 text-emerald-300 font-bold">×{e.cantidad}</span>
                      )}
                      {e.kind === 'reaccion' && (
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${SEV_META[e.severidad]?.cls || 'bg-slate-700 text-slate-300'}`}>
                          {SEV_META[e.severidad]?.label || e.severidad}
                        </span>
                      )}
                      {e.kind === 'reaccion' && e.zonas.length > 0 && (
                        <div className="mt-1 text-xs font-normal text-rose-300">
                          {zonaLabels(e.zonas).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-violet-300">{e.kind === 'reaccion' && e.vinculada}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditando(e)} className="text-slate-500 hover:text-emerald-400 transition-colors" title="Editar">
                          <Icon path={mdiPencilOutline} size={0.95} />
                        </button>
                        <button onClick={() => eliminar(e)} className="text-slate-500 hover:text-rose-400 transition-colors" title="Eliminar">
                          <Icon path={mdiDeleteOutline} size={0.95} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {editando && (
        <EntradaEditor
          userId={userId}
          entry={editando}
          comidas={datos.comidas}
          tipos={datos.tipos}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  )
}