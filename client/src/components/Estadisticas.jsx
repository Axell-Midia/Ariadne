import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db.js'
import EChart from './EChart.jsx'
import Icon from './Icon.jsx'
import { mdiSilverwareForkKnife, mdiPill, mdiAlertDecagram, mdiFire,
  mdiChartBar, mdiStomach, mdiClockOutline, mdiWaves, mdiLinkVariant, mdiArrowRight } from '@mdi/js'

const SEV_COLORS = { leve: '#10b981', moderada: '#f59e0b', fuerte: '#f43f5e' }

const VENTANA_MS = 3 * 3600 * 1000
const SEV_WEIGHT = { leve: 1, moderada: 2, fuerte: 3 }

function grad(c1, c2) {
  return {
    type: 'linear',
    x: 0, y: 0, x2: 1, y2: 0,
    colorStops: [
      { offset: 0, color: c1 },
      { offset: 1, color: c2 }
    ]
  }
}

function gradVertical(c1, c2) {
  return {
    type: 'linear',
    x: 0, y: 0, x2: 0, y2: 1,
    colorStops: [
      { offset: 0, color: c1 },
      { offset: 1, color: c2 }
    ]
  }
}

function barOption(data, colorA, colorB) {
  const gradient = grad(colorA, colorB)
  return {
    grid: { left: 10, right: 24, top: 6, bottom: 6, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#0f172a',
      borderWidth: 0,
      textStyle: { color: '#f1f5f9', fontSize: 12 },
      formatter: (ps) => `${ps[0].name}: <b>${ps[0].value}</b>`
    },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(148,163,184,0.14)' } }, axisLabel: { color: '#7c8aa5', fontSize: 11 } },
    yAxis: {
      type: 'category',
      data: data.map((d) => d.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#a5b4c9', fontSize: 12, fontWeight: 600 }
    },
    series: [{
      type: 'bar',
      data: data.map((d) => d.value),
      barWidth: 14,
      itemStyle: { borderRadius: [0, 7, 7, 0], color: gradient },
      label: { show: true, position: 'right', color: '#cbd5e1', fontWeight: 700, fontSize: 11 }
    }]
  }
}

function areaOption(serie) {
  return {
    grid: { left: 6, right: 14, top: 28, bottom: 18, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#0f172a',
      borderWidth: 0,
      textStyle: { color: '#f1f5f9', fontSize: 12 }
    },
    legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: '#94a3b8', fontSize: 11 } },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: serie.map((s) => s.fecha),
      axisLine: { lineStyle: { color: '#2b3a55' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: 'rgba(148,163,184,0.14)' } },
      axisLabel: { color: '#94a3b8', fontSize: 11 }
    },
    series: [{
      name: 'Comidas',
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      data: serie.map((s) => s.comidas),
      lineStyle: { width: 3, color: '#10b981' },
      itemStyle: { color: '#10b981' },
      areaStyle: {
        color: gradVertical('rgba(16,185,129,0.35)', 'rgba(16,185,129,0.02)')
      }
    }, {
      name: 'Reacciones',
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      data: serie.map((s) => s.reacciones),
      lineStyle: { width: 3, color: '#8b5cf6' },
      itemStyle: { color: '#8b5cf6' },
      areaStyle: {
        color: gradVertical('rgba(139,92,246,0.35)', 'rgba(139,92,246,0.02)')
      }
    }]
  }
}

function donutOption(sevPie) {
  return {
    tooltip: {
      backgroundColor: '#0f172a',
      borderWidth: 0,
      textStyle: { color: '#f1f5f9', fontSize: 12 },
      formatter: (p) => `${p.name}: <b>${p.value}</b>`
    },
    series: [{
      type: 'pie',
      radius: ['58%', '82%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 8, borderColor: '#101b2e', borderWidth: 3 },
      label: { show: true, position: 'center', formatter: () => 'Severidad', color: '#7c8aa5', fontSize: 12, fontWeight: 700 },
      emphasis: { label: { show: false } },
      data: sevPie.map((s) => ({ name: `${s.name}`, value: s.value, itemStyle: { color: SEV_COLORS[s.name.toLowerCase()] || '#10b981' } }))
    }]
  }
}

const cardStyles = [
  { icon: mdiSilverwareForkKnife, cls: 'from-emerald-500 to-teal-500', label: 'Comidas' },
  { icon: mdiPill, cls: 'from-violet-500 to-purple-600', label: 'Reacciones' },
  { icon: mdiAlertDecagram, cls: 'from-amber-400 to-orange-500', label: 'Moderadas' },
  { icon: mdiFire, cls: 'from-rose-500 to-pink-600', label: 'Fuertes' }
]

export default function Estadisticas({ userId }) {
  const stats = useLiveQuery(async () => {
    const [registros, reacciones, comidas, tipos] = await Promise.all([
      db.registros.where('usuario_id').equals(userId).toArray(),
      db.reacciones.where('usuario_id').equals(userId).toArray(),
      db.comidas.toArray(),
      db.tipos.toArray()
    ])

    const comidaNombre = new Map(comidas.map((c) => [c.id, c.nombre]))
    const tipoNombre = new Map(tipos.map((t) => [t.id, t.nombre]))

    const conteoComidas = {}
    for (const r of registros) {
      const n = comidaNombre.get(r.comida_id)
      if (n) conteoComidas[n] = (conteoComidas[n] || 0) + 1
    }
    const topComidas = Object.entries(conteoComidas)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)

    const conteoReacciones = {}
    const sevCount = { leve: 0, moderada: 0, fuerte: 0 }
    for (const r of reacciones) {
      const n = tipoNombre.get(r.tipo_reaccion_id)
      if (n) conteoReacciones[n] = (conteoReacciones[n] || 0) + 1
      if (r.severidad in sevCount) sevCount[r.severidad]++
    }
    const topReacciones = Object.entries(conteoReacciones)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)

    const registrosOrdenados = registros
      .map((r) => ({ ms: new Date(r.fecha_hora).getTime(), comidaId: r.comida_id }))
      .sort((a, b) => a.ms - b.ms)

    const paresMap = new Map()
    for (const r of reacciones) {
      const tipo = tipoNombre.get(r.tipo_reaccion_id)
      if (!tipo) continue
      const ms = new Date(r.fecha_hora).getTime()
      const vinculado = !!r.registro_comida_id
      let comidaId = null
      if (vinculado) {
        const reg = registros.find((o) => o.id === r.registro_comida_id)
        if (reg) comidaId = reg.comida_id
      }
      if (!comidaId) {
        let mejor = null
        for (const reg of registrosOrdenados) {
          if (reg.ms > ms) break
          if (ms - reg.ms <= VENTANA_MS) mejor = reg
        }
        if (mejor) comidaId = mejor.comidaId
      }
      if (!comidaId) continue
      const key = `${comidaId}|${r.tipo_reaccion_id}`
      const prev = paresMap.get(key) || { comida: comidaNombre.get(comidaId) || 'Comida', tipo, veces: 0, peso: 0, vinculadas: 0 }
      prev.veces++
      prev.peso += SEV_WEIGHT[r.severidad] || 1
      if (vinculado) prev.vinculadas++
      paresMap.set(key, prev)
    }
    const patrones = [...paresMap.values()]
      .sort((a, b) => b.peso - a.peso || b.veces - a.veces)
      .slice(0, 10)
    const totalPatrones = paresMap.size

    const dias = {}
    const hoy = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(hoy)
      d.setDate(d.getDate() - i)
      dias[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`] = 0
    }
    const serie = Object.keys(dias).map((k) => ({ fecha: k, comidas: 0, reacciones: 0 }))
    const idxMap = new Map(serie.map((s, i) => [s.fecha, i]))
    for (const r of registros) {
      const f = r.fecha_hora.slice(0, 10)
      const i = idxMap.get(f)
      if (i !== undefined) serie[i].comidas++
    }
    for (const r of reacciones) {
      const f = r.fecha_hora.slice(0, 10)
      const i = idxMap.get(f)
      if (i !== undefined) serie[i].reacciones++
    }
    const ultimos30 = serie.map((s) => ({ ...s, fecha: s.fecha.slice(5) }))

    return {
      topComidas, topReacciones, ultimos30, patrones, totalPatrones,
      totales: {
        comidas: registros.length,
        reacciones: reacciones.length,
        moderadas: sevCount.moderada,
        fuertes: sevCount.fuerte
      },
      sevPie: [
        { name: 'Leve', value: sevCount.leve },
        { name: 'Moderada', value: sevCount.moderada },
        { name: 'Fuerte', value: sevCount.fuerte }
      ]
    }
  }, [userId])

  if (!stats || stats.totales.comidas + stats.totales.reacciones === 0) {
    return (
      <div className="card text-center py-12 text-muted">
        <Icon path={mdiChartBar} size={2.5} className="mx-auto mb-3 text-emerald-400" />
        <p className="font-medium">Regístrate comidas y reacciones</p>
        <p className="text-sm">para ver tus estadísticas aquí.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: mdiSilverwareForkKnife, color: 'from-emerald-500 to-teal-500', label: 'Comidas', val: stats.totales.comidas, glow: 'shadow-emerald-500/30' },
          { icon: mdiPill, color: 'from-violet-500 to-purple-600', label: 'Reacciones', val: stats.totales.reacciones, glow: 'shadow-violet-500/30' },
          { icon: mdiClockOutline, color: 'from-amber-400 to-orange-500', label: 'Moderadas', val: stats.totales.moderadas, glow: 'shadow-amber-500/30' },
          { icon: mdiFire, color: 'from-rose-500 to-pink-600', label: 'Fuertes', val: stats.totales.fuertes, glow: 'shadow-rose-500/30' }
        ].map((c, i) => (
          <div key={i} className="card flex items-center gap-3 p-4">
            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${c.color} flex items-center justify-center shadow-lg ${c.glow}`}>
              <Icon path={c.icon} size={1.2} className="text-white" />
            </div>
            <div>
              <div className="text-xl font-extrabold leading-none">{c.val}</div>
              <div className="text-xs text-muted mt-0.5">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          <Icon path={mdiSilverwareForkKnife} size={1.1} className="text-emerald-500" />
          <h3 className="font-bold">Comidas más frecuentes</h3>
        </div>
        {stats.topComidas.length === 0
          ? <p className="text-sm text-muted">Aún sin datos.</p>
          : <EChart option={barOption(stats.topComidas, '#34d399', '#0d9488')} />}
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <Icon path={mdiStomach} size={1.1} className="text-violet-500" />
          <h3 className="font-bold">Reacciones más frecuentes</h3>
        </div>
        {stats.topReacciones.length === 0
          ? <p className="text-sm text-muted">Aún sin datos.</p>
          : <EChart option={barOption(stats.topReacciones, '#a78bfa', '#7c3aed')} />}
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <Icon path={mdiLinkVariant} size={1.1} className="text-cyan-400" />
          <h3 className="font-bold">Patrones comida → reacción</h3>
        </div>
        <p className="text-xs text-muted mb-3">Comidas que aparecen antes de una reacción: vínculo directo o dentro de las 3 h previas. Ordenado por peso (leve 1 · moderada 2 · fuerte 3).</p>
        {stats.patrones.length === 0 ? (
          <p className="text-sm text-muted">Aún no hay patrones. Asocia tus reacciones a comidas o regístralas dentro de las 3 h siguientes.</p>
        ) : (
          <div className="space-y-2">
            {stats.patrones.map((p, i) => (
              <div key={i} className="flex items-center gap-3 bg-[#0e1a30]/70 rounded-xl p-2.5 border border-transparent hover:border-slate-700 transition-all">
                <div className="w-7 h-7 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</div>
                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-300 truncate">
                    <Icon path={mdiSilverwareForkKnife} size={0.75} />{p.comida}
                  </span>
                  <Icon path={mdiArrowRight} size={0.8} className="text-slate-500 shrink-0" />
                  <span className="inline-flex items-center gap-1 font-semibold text-violet-300 truncate">
                    <Icon path={mdiPill} size={0.75} />{p.tipo}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-slate-200">{p.veces}<span className="text-xs font-normal text-muted"> {p.veces === 1 ? 'vez' : 'veces'}</span></div>
                  <div className="text-[10px] text-slate-500">peso {p.peso}{p.vinculadas > 0 ? ` · ${p.vinculadas} vinculada${p.vinculadas === 1 ? '' : 's'}` : ''}</div>
                </div>
              </div>
            ))}
            {stats.totalPatrones > stats.patrones.length && (
              <p className="text-[11px] text-slate-500 text-center pt-1">Mostrando 10 de {stats.totalPatrones} patrones.</p>
            )}
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <Icon path={mdiWaves} size={1.1} className="text-rose-400" />
            <h3 className="font-bold">Distribución por severidad</h3>
          </div>
          <EChart option={donutOption(stats.sevPie)} height={200} />
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <Icon path={mdiClockOutline} size={1.1} className="text-cyan-500" />
            <h3 className="font-bold">Actividad últimos 30 días</h3>
          </div>
          <EChart option={areaOption(stats.ultimos30)} height={200} />
        </div>
      </div>
    </div>
  )
}