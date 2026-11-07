import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { db } from './db.js'
import { zonaLabels } from './zonas.js'

const ML_VASO = 250
const SEV_LABEL = { leve: 'Leve', moderada: 'Moderada', fuerte: 'Fuerte' }

const pad = (n) => String(n).padStart(2, '0')
const fmtFecha = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
const fmtHora = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const diaKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const diaLargo = (key) => {
  const d = new Date(`${key}T00:00:00`)
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
const nombreDia = (key) => {
  const hoy = diaKey(new Date())
  const ayer = new Date()
  ayer.setDate(ayer.getDate() - 1)
  if (key === hoy) return 'Hoy'
  if (key === diaKey(ayer)) return 'Ayer'
  return diaLargo(key)
}

export async function recolectarHistorial(userId) {
  const [registros, reacciones, comidas, tipos, notas, vasos] = await Promise.all([
    db.registros.where('usuario_id').equals(userId).sortBy('fecha_hora'),
    db.reacciones.where('usuario_id').equals(userId).sortBy('fecha_hora'),
    db.comidas.toArray(),
    db.tipos.toArray(),
    db.notas.where('usuario_id').equals(userId).sortBy('fecha_hora'),
    db.vasos.where('usuario_id').equals(userId).sortBy('fecha_hora')
  ])

  const comidaNombre = new Map(comidas.map((c) => [c.id, c.nombre]))
  const tipoNombre = new Map(tipos.map((t) => [t.id, t.nombre]))
  const regById = new Map(registros.map((r) => [r.id, r]))

  const filasComidas = registros.map((r) => {
    const d = new Date(r.fecha_hora)
    return {
      fecha: fmtFecha(d),
      hora: fmtHora(d),
      dia: diaKey(d),
      alimento: comidaNombre.get(r.comida_id) || 'Comida',
      cantidad: r.cantidad || 1
    }
  })

  const filasReacciones = reacciones.map((r) => {
    const d = new Date(r.fecha_hora)
    const reg = r.registro_comida_id ? regById.get(r.registro_comida_id) : null
    return {
      fecha: fmtFecha(d),
      hora: fmtHora(d),
      dia: diaKey(d),
      reaccion: tipoNombre.get(r.tipo_reaccion_id) || 'Reacción',
      severidad: SEV_LABEL[r.severidad] || r.severidad || '',
      zonas: (r.zonas || []).length ? zonaLabels(r.zonas).join(', ') : '',
      vinculada: reg ? comidaNombre.get(reg.comida_id) || 'Comida' : ''
    }
  })

  const filasNotas = notas.map((n) => {
    const d = new Date(n.fecha_hora)
    return { fecha: fmtFecha(d), hora: fmtHora(d), dia: diaKey(d), nota: n.contenido }
  })

  const contadorPorDia = new Map()
  const filasVasos = vasos.map((v) => {
    const d = new Date(v.fecha_hora)
    const key = diaKey(d)
    const n = (contadorPorDia.get(key) || 0) + 1
    contadorPorDia.set(key, n)
    return {
      fecha: fmtFecha(d),
      hora: fmtHora(d),
      dia: key,
      vaso: n,
      descripcion: v.tipo || '',
      ml: ML_VASO
    }
  })

  const dias = new Set([
    ...filasComidas.map((r) => r.dia),
    ...filasReacciones.map((r) => r.dia),
    ...filasNotas.map((r) => r.dia),
    ...filasVasos.map((r) => r.dia)
  ])

  const conteo = (filas, key) => {
    const m = new Map()
    for (const f of filas) m.set(f[key], (m.get(f[key]) || 0) + 1)
    return m
  }
  const cComidas = conteo(filasComidas, 'dia')
  const cReacc = conteo(filasReacciones, 'dia')
  const cNotas = conteo(filasNotas, 'dia')
  const cVasos = conteo(filasVasos, 'dia')

  const resumen = [...dias].sort().map((key) => ({
    dia: key,
    diaLargo: nombreDia(key),
    comidas: cComidas.get(key) || 0,
    reacciones: cReacc.get(key) || 0,
    notas: cNotas.get(key) || 0,
    vasos: cVasos.get(key) || 0,
    ml: (cVasos.get(key) || 0) * ML_VASO
  }))

  const fechas = [...dias].sort()
  return {
    generado: new Date(),
    rango: fechas.length
      ? `${nombreDia(fechas[0])} → ${nombreDia(fechas[fechas.length - 1])}`
      : 'Sin registros',
    resumen,
    comidas: filasComidas,
    reacciones: filasReacciones,
    notas: filasNotas,
    vasos: filasVasos,
    totales: {
      comidas: filasComidas.length,
      reacciones: filasReacciones.length,
      notas: filasNotas.length,
      vasos: filasVasos.length,
      ml: filasVasos.length * ML_VASO
    }
  }
}

const nombreArchivo = (ext) => {
  const d = new Date()
  return `FoodTracker-historial-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.${ext}`
}

function hoja(headers, filas) {
  const aoa = [headers.map((h) => h.label), ...filas.map((f) => headers.map((h) => f[h.key]))]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = headers.map((h) => ({ wch: h.w }))
  return ws
}

export function exportarExcel(datos) {
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(
    wb,
    hoja(
      [
        { key: 'diaLargo', label: 'Día', w: 30 },
        { key: 'comidas', label: 'Comidas', w: 9 },
        { key: 'reacciones', label: 'Reacciones', w: 11 },
        { key: 'notas', label: 'Notas', w: 8 },
        { key: 'vasos', label: 'Vasos', w: 8 },
        { key: 'ml', label: 'Agua (ml)', w: 11 }
      ],
      datos.resumen
    ),
    'Resumen'
  )

  XLSX.utils.book_append_sheet(
    wb,
    hoja(
      [
        { key: 'fecha', label: 'Fecha', w: 12 },
        { key: 'hora', label: 'Hora', w: 7 },
        { key: 'alimento', label: 'Comida', w: 32 },
        { key: 'cantidad', label: 'Cantidad', w: 9 }
      ],
      datos.comidas
    ),
    'Comidas'
  )

  XLSX.utils.book_append_sheet(
    wb,
    hoja(
      [
        { key: 'fecha', label: 'Fecha', w: 12 },
        { key: 'hora', label: 'Hora', w: 7 },
        { key: 'reaccion', label: 'Reacción', w: 26 },
        { key: 'severidad', label: 'Severidad', w: 11 },
        { key: 'zonas', label: 'Zonas', w: 34 },
        { key: 'vinculada', label: 'Vinculada a', w: 22 }
      ],
      datos.reacciones
    ),
    'Reacciones'
  )

  XLSX.utils.book_append_sheet(
    wb,
    hoja(
      [
        { key: 'fecha', label: 'Fecha', w: 12 },
        { key: 'hora', label: 'Hora', w: 7 },
        { key: 'nota', label: 'Nota', w: 70 }
      ],
      datos.notas
    ),
    'Notas'
  )

  XLSX.utils.book_append_sheet(
    wb,
    hoja(
      [
        { key: 'fecha', label: 'Fecha', w: 12 },
        { key: 'hora', label: 'Hora', w: 7 },
        { key: 'vaso', label: 'N.º vaso', w: 9 },
        { key: 'descripcion', label: 'Descripción', w: 30 },
        { key: 'ml', label: 'ml', w: 7 }
      ],
      datos.vasos
    ),
    'Agua'
  )

  XLSX.writeFile(wb, nombreArchivo('xlsx'))
}

export function exportarPDF(datos) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 42
  const VERDE = [16, 185, 129]
  const t = datos.totales

  const pie = () => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(160, 160, 160)
    doc.text('FoodTracker', M, H - 22)
    doc.text(`Página ${doc.internal.getCurrentPageInfo().pageNumber}`, W - M, H - 22, { align: 'right' })
  }

  let y = 0

  const nuevaPaginaSiFalta = (espacio = 140) => {
    if (y > H - espacio) {
      doc.addPage()
      y = M + 20
    }
  }

  const titulo = (texto, size = 12) => {
    nuevaPaginaSiFalta()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(size)
    doc.setTextColor(15, 23, 42)
    doc.text(texto, M, y)
    y += 8
  }

  const tabla = (opts) => {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      styles: { fontSize: 9, cellPadding: 5, textColor: [40, 40, 40], lineColor: [230, 230, 230] },
      headStyles: { fillColor: VERDE, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [246, 248, 250] },
      didDrawPage: pie,
      ...opts
    })
    y = doc.lastAutoTable.finalY + 20
  }

  // Portada / encabezado
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(15, 23, 42)
  doc.text('FoodTracker · Historial', M, 56)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  doc.text(`Exportado el ${fmtFecha(datos.generado)} a las ${fmtHora(datos.generado)}`, M, 74)
  doc.text(`Rango: ${datos.rango}`, M, 88)
  doc.text(
    `Totales: ${t.comidas} comidas · ${t.reacciones} reacciones · ${t.notas} notas · ${t.vasos} vasos (${t.ml} ml)`,
    M,
    102
  )
  y = 126

  if (datos.resumen.length === 0) {
    doc.setFontSize(11)
    doc.setTextColor(80, 80, 80)
    doc.text('No hay registros para exportar.', M, y)
    doc.save(nombreArchivo('pdf'))
    return
  }

  titulo('Resumen por día')
  tabla({
    head: [['Día', 'Comidas', 'Reacciones', 'Notas', 'Vasos', 'Agua (ml)']],
    body: datos.resumen.map((r) => [r.diaLargo, r.comidas, r.reacciones, r.notas, r.vasos, r.ml]),
    columnStyles: {
      0: { cellWidth: 190 },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center' }
    }
  })

  if (datos.comidas.length) {
    titulo('Comidas')
    tabla({
      head: [['Fecha', 'Hora', 'Comida', 'Cantidad']],
      body: datos.comidas.map((r) => [r.fecha, r.hora, r.alimento, r.cantidad]),
      columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 50 }, 3: { cellWidth: 60, halign: 'center' } }
    })
  }

  if (datos.reacciones.length) {
    titulo('Reacciones')
    tabla({
      head: [['Fecha', 'Hora', 'Reacción', 'Severidad', 'Zonas', 'Vinculada a']],
      body: datos.reacciones.map((r) => [r.fecha, r.hora, r.reaccion, r.severidad, r.zonas, r.vinculada]),
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 44 },
        3: { cellWidth: 66 },
        5: { cellWidth: 80 }
      }
    })
  }

  if (datos.notas.length) {
    titulo('Notas')
    tabla({
      head: [['Fecha', 'Hora', 'Nota']],
      body: datos.notas.map((r) => [r.fecha, r.hora, r.nota]),
      columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 50 } }
    })
  }

  if (datos.vasos.length) {
    titulo('Agua (vasos)')
    tabla({
      head: [['Fecha', 'Hora', 'N.º vaso', 'Descripción', 'ml']],
      body: datos.vasos.map((r) => [r.fecha, r.hora, r.vaso, r.descripcion, r.ml]),
      columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 50 }, 2: { cellWidth: 60, halign: 'center' }, 4: { cellWidth: 50, halign: 'center' } }
    })
  }

  doc.save(nombreArchivo('pdf'))
}
