import { useState, useEffect } from 'react'
import { db } from './db.js'

const DIA = 86400000
const VENTANA_H = 2
const HISTORIAL_DIAS = 30

function distHoras(a, b) {
  const d = Math.abs(a - b) % 24
  return Math.min(d, 24 - d)
}

export function useFranja() {
  const [franja, setFranja] = useState(() => new Date().getHours())
  useEffect(() => {
    const id = setInterval(() => {
      const h = new Date().getHours()
      setFranja((prev) => (prev === h ? prev : h))
    }, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])
  return franja
}

async function topPorFranja(table, fk, userId, franja) {
  const desde = new Date(Date.now() - HISTORIAL_DIAS * DIA).toISOString()
  const eventos = await table.where('fecha_hora').above(desde).toArray()
  const porId = new Map()
  for (const ev of eventos) {
    if (ev.usuario_id !== userId) continue
    const id = ev[fk]
    if (!id) continue
    const t = new Date(ev.fecha_hora).getTime()
    const h = new Date(ev.fecha_hora).getHours()
    const r = porId.get(id) || { veces: 0, vecesFranja: 0, last: 0 }
    r.veces++
    if (distHoras(h, franja) <= VENTANA_H) {
      r.vecesFranja += Date.now() - t <= 7 * DIA ? 2 : 1
    }
    if (t > r.last) r.last = t
    porId.set(id, r)
  }
  const ahora = Date.now()
  return [...porId.entries()]
    .map(([id, r]) => {
      const dias = (ahora - r.last) / DIA
      const rec = dias <= 7 ? 3 : dias <= 14 ? 2 : dias <= 30 ? 1 : 0.5
      return { id, vecesFranja: r.vecesFranja, score: r.vecesFranja || r.veces * rec * 0.5 }
    })
    .sort((a, b) => b.score - a.score)
}

export async function sugerencias(userId, franja) {
  const [topComidas, topReacciones] = await Promise.all([
    topPorFranja(db.registros, 'comida_id', userId, franja),
    topPorFranja(db.reacciones, 'tipo_reaccion_id', userId, franja)
  ])
  const [comidas, tipos] = await Promise.all([
    db.comidas.bulkGet(topComidas.slice(0, 8).map((x) => x.id)),
    db.tipos.bulkGet(topReacciones.slice(0, 6).map((x) => x.id))
  ])
  return {
    comidas: topComidas
      .slice(0, 8)
      .map((x, i) => comidas[i] && { ...comidas[i], score: x.score, enFranja: x.vecesFranja > 0 })
      .filter(Boolean)
      .slice(0, 5),
    reacciones: topReacciones
      .slice(0, 6)
      .map((x, i) => tipos[i] && { ...tipos[i], score: x.score, enFranja: x.vecesFranja > 0 })
      .filter(Boolean)
      .slice(0, 4)
  }
}
