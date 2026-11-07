import { db } from './db.js'
import { zonaLabels } from './zonas.js'

const DIA = 86400000
const VENTANA_MS = 3 * 3600 * 1000
const HISTORIAL_DIAS = 30
const SEV_PESO = { leve: 1, moderada: 2, fuerte: 3 }

export function limitesDelDia(fecha = new Date()) {
  const ini = new Date(fecha)
  ini.setHours(0, 0, 0, 0)
  const fin = new Date(ini)
  fin.setDate(fin.getDate() + 1)
  return [ini, fin]
}

const hora = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
const porFecha = (a, b) => a.fecha_hora.localeCompare(b.fecha_hora)

async function rangoTabla(tabla, ini, fin, userId) {
  const filas = await tabla.where('fecha_hora').between(ini.toISOString(), fin.toISOString()).toArray()
  return filas.filter((f) => f.usuario_id === userId)
}

export async function conteoDelDia(userId, fecha = new Date()) {
  const [ini, fin] = limitesDelDia(fecha)
  const [registros, reacciones, notas, vasos] = await Promise.all([
    rangoTabla(db.registros, ini, fin, userId),
    rangoTabla(db.reacciones, ini, fin, userId),
    rangoTabla(db.notas, ini, fin, userId),
    rangoTabla(db.vasos, ini, fin, userId)
  ])
  return {
    comidas: registros.length,
    malestares: reacciones.length,
    notas: notas.length,
    vasos: vasos.length
  }
}

async function historicoTexto(userId) {
  const desde = new Date(Date.now() - HISTORIAL_DIAS * DIA).toISOString()
  const [registros, reacciones, vasos, comidas, tipos] = await Promise.all([
    db.registros.where('fecha_hora').above(desde).toArray(),
    db.reacciones.where('fecha_hora').above(desde).toArray(),
    db.vasos.where('fecha_hora').above(desde).toArray(),
    db.comidas.toArray(),
    db.tipos.toArray()
  ])
  const mios = (arr) => arr.filter((x) => x.usuario_id === userId)
  const regs = mios(registros)
  const reaccs = mios(reacciones)
  const vas = mios(vasos)

  const nombreComida = new Map(comidas.map((c) => [c.id, c.nombre]))
  const nombreTipo = new Map(tipos.map((t) => [t.id, t.nombre]))

  const lineas = []
  if (!regs.length && !reaccs.length && !vas.length) {
    return { lineas: ['- (sin historial previo)'], topMalestares: [], patrones: [], diasActivos: 0 }
  }

  // días con actividad (comidas, malestares o agua)
  const dias = new Set()
  for (const r of regs) dias.add(r.fecha_hora.slice(0, 10))
  for (const r of reaccs) dias.add(r.fecha_hora.slice(0, 10))
  for (const v of vas) dias.add(v.fecha_hora.slice(0, 10))
  const diasActivos = dias.size
  const prom = (n) => (n / Math.max(diasActivos, 1)).toFixed(1).replace('.', ',')

  lineas.push(
    `- Días con registros: ${diasActivos} de ${HISTORIAL_DIAS} · promedio ${prom(regs.length)} comidas y ${prom(vas.length)} vasos por día activo`
  )

  // malestares más frecuentes
  const conteoTipo = {}
  for (const r of reaccs) {
    const n = nombreTipo.get(r.tipo_reaccion_id)
    if (n) conteoTipo[n] = (conteoTipo[n] || 0) + 1
  }
  const topMalestares = Object.entries(conteoTipo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  if (topMalestares.length) {
    lineas.push('- Malestares más frecuentes: ' + topMalestares.map(([n, c]) => `${n} (${c})`).join(', '))
  }

  // pares comida → malestar (misma lógica que Stats, ventana de 3 h)
  const regsOrdenados = regs
    .map((r) => ({ ms: new Date(r.fecha_hora).getTime(), comidaId: r.comida_id, id: r.id }))
    .sort((a, b) => a.ms - b.ms)
  const pares = new Map()
  for (const r of reaccs) {
    const tipo = nombreTipo.get(r.tipo_reaccion_id)
    if (!tipo) continue
    const ms = new Date(r.fecha_hora).getTime()
    let comidaId = null
    if (r.registro_comida_id) {
      const reg = regs.find((o) => o.id === r.registro_comida_id)
      if (reg) comidaId = reg.comida_id
    }
    if (!comidaId) {
      let mejor = null
      for (const reg of regsOrdenados) {
        if (reg.ms > ms) break
        if (ms - reg.ms <= VENTANA_MS) mejor = reg
      }
      if (mejor) comidaId = mejor.comidaId
    }
    if (!comidaId) continue
    const key = `${comidaId}|${r.tipo_reaccion_id}`
    const prev = pares.get(key) || {
      comida: nombreComida.get(comidaId) || 'Comida',
      tipo,
      veces: 0,
      peso: 0
    }
    prev.veces++
    prev.peso += SEV_PESO[r.severidad] || 1
    pares.set(key, prev)
  }
  const patrones = [...pares.values()]
    .filter((p) => p.veces >= 2)
    .sort((a, b) => b.peso - a.peso || b.veces - a.veces)
    .slice(0, 6)
  if (patrones.length) {
    lineas.push(
      '- Patrones repetidos (comida → malestar): ' +
        patrones.map((p) => `${p.comida} → ${p.tipo} (${p.veces} veces)`).join('; ')
    )
  } else {
    lineas.push('- Patrones repetidos: aún no hay pares comida → malestar con 2 o más ocurrencias')
  }

  return { lineas, topMalestares, patrones, diasActivos }
}

export async function construirContexto(userId, fecha = new Date()) {
  const [ini, fin] = limitesDelDia(fecha)
  const [registros, reacciones, notas, vasos] = await Promise.all([
    rangoTabla(db.registros, ini, fin, userId),
    rangoTabla(db.reacciones, ini, fin, userId),
    rangoTabla(db.notas, ini, fin, userId),
    rangoTabla(db.vasos, ini, fin, userId)
  ])
  const regs = [...registros].sort(porFecha)
  const reaccs = [...reacciones].sort(porFecha)
  const notasDia = [...notas].sort(porFecha)

  const comidas = await db.comidas.bulkGet(regs.map((r) => r.comida_id))
  const tipos = await db.tipos.bulkGet(reaccs.map((r) => r.tipo_reaccion_id))
  const nombreComida = new Map(comidas.filter(Boolean).map((c) => [c.id, c.nombre]))
  const nombreTipo = new Map(tipos.filter(Boolean).map((t) => [t.id, t.nombre]))

  const lineas = [
    'FECHA: ' +
      fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  ]

  if (regs.length) {
    lineas.push('', `COMIDAS DE HOY (${regs.length}):`)
    for (const r of regs) {
      const n = nombreComida.get(r.comida_id) || 'Comida'
      const cant = r.cantidad && r.cantidad > 1 ? ` ×${r.cantidad}` : ''
      lineas.push(`- ${hora(r.fecha_hora)} ${n}${cant}`)
    }
  }

  if (reaccs.length) {
    lineas.push('', `MALESTARES DE HOY (${reaccs.length}):`)
    for (const r of reaccs) {
      const n = nombreTipo.get(r.tipo_reaccion_id) || 'Malestar'
      const partes = [`severidad ${r.severidad || 'leve'}`]
      if (r.registro_comida_id) {
        const reg = regs.find((x) => x.id === r.registro_comida_id)
        const cn = reg && nombreComida.get(reg.comida_id)
        if (cn) partes.push(`vinculado a: ${cn}`)
      }
      if (Array.isArray(r.zonas) && r.zonas.length) {
        partes.push('zonas: ' + zonaLabels(r.zonas).join(', '))
      }
      lineas.push(`- ${hora(r.fecha_hora)} ${n} · ${partes.join(' · ')}`)
    }
  }

  const tiposVaso = {}
  for (const v of vasos) {
    const k = v.tipo || 'sin tipo'
    tiposVaso[k] = (tiposVaso[k] || 0) + 1
  }
  const mezcla = Object.entries(tiposVaso)
    .map(([k, n]) => (n > 1 ? `${n}×` : '') + k)
    .join(', ')
  lineas.push(
    '',
    `AGUA: ${vasos.length} vaso${vasos.length === 1 ? '' : 's'}` + (vasos.length ? ` (${mezcla})` : '')
  )

  if (notasDia.length) {
    lineas.push('', `NOTAS DE HOY (${notasDia.length}):`)
    for (const n of notasDia) {
      lineas.push(`- ${hora(n.fecha_hora)} "${String(n.contenido).slice(0, 180)}"`)
    }
  }

  const historial = await historicoTexto(userId)
  lineas.push('', `HISTÓRICO (últimos ${HISTORIAL_DIAS} días):`, ...historial.lineas)

  return {
    texto: lineas.join('\n'),
    delDia: {
      comidas: regs.length,
      malestares: reaccs.length,
      vasos: vasos.length,
      notas: notasDia.length
    },
    vacio: regs.length + reaccs.length + notasDia.length + vasos.length === 0
  }
}
