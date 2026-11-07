import { useState, useEffect, useRef, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db.js'
import Icon from './Icon.jsx'
import { mdiMagnify, mdiClose, mdiPlus, mdiStar, mdiPill, mdiSilverwareForkKnife } from '@mdi/js'

const DIA = 86400000

async function rankingUso(tableName) {
  const desde = new Date(Date.now() - 90 * DIA).toISOString()
  const map = new Map()
  let filas = []
  if (tableName === 'comidas') filas = await db.registros.where('fecha_hora').above(desde).toArray()
  else if (tableName === 'tipos') filas = await db.reacciones.where('fecha_hora').above(desde).toArray()
  else return map
  for (const f of filas) {
    const id = tableName === 'comidas' ? f.comida_id : f.tipo_reaccion_id
    if (!id) continue
    const r = map.get(id) || { veces: 0, last: 0 }
    r.veces++
    const t = new Date(f.fecha_hora).getTime()
    if (t > r.last) r.last = t
    map.set(id, r)
  }
  return map
}

export default function Autocomplete({
  tableName,
  searchFields,
  placeholder,
  onCreate,
  onSelect,
  value,
  icon
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const ref = useRef(null)
  const fields = useMemo(() => searchFields, [searchFields])

  const items = useLiveQuery(
    async () => {
      const table = tableName && db.table(tableName)
      if (!table) return []
      const q = query.trim().toLowerCase()
      const [rows, uso] = await Promise.all([
        q
          ? table.filter((row) =>
              fields.some((f) => String(row[f] ?? '').toLowerCase().includes(q))
            ).toArray()
          : table.toArray(),
        rankingUso(tableName)
      ])
      const ahora = Date.now()
      const score = (row) => {
        const r = uso.get(row.id)
        if (!r) return 0
        const dias = (ahora - r.last) / DIA
        const rec = dias <= 7 ? 3 : dias <= 14 ? 2 : dias <= 30 ? 1 : 0.5
        let s = r.veces * rec
        if (q) {
          const nombre = String(row[fields[0]] ?? '').toLowerCase()
          if (nombre === q) s += 50
          else if (nombre.startsWith(q)) s += 20
        }
        return s
      }
      return rows
        .map((row) => ({ row, s: score(row) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 8)
        .map((x) => x.row)
    },
    [tableName, query, fields]
  ) || []

  const shown = items.filter((it) => it.id !== value?.id)

  useEffect(() => {
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('touchstart', onDocClick)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('touchstart', onDocClick)
    }
  }, [])

  useEffect(() => setActive(-1), [query])

  useEffect(() => {
    if (value) setQuery(value.nombre)
  }, [value])

  const q = query.trim().toLowerCase()
  const isNew = !!q && !value
  const exactMatch = q ? shown.find((it) => String(it.nombre).toLowerCase() === q) : null
  const showCreate = isNew && !exactMatch
  const itemIcon = tableName === 'tipos' ? mdiPill : mdiSilverwareForkKnife

  const handleKey = (e) => {
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, shown.length + (showCreate ? 1 : 0) - 1))
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (active >= 0 && active < shown.length) {
        select(shown[active])
      } else if (exactMatch) {
        select(exactMatch)
      } else if (showCreate) {
        createNew()
      } else if (shown.length > 0) {
        select(shown[0])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const select = (item) => {
    onSelect(item)
    setQuery(item.nombre)
    setOpen(false)
  }

  const createNew = () => {
    if (!query.trim()) return
    onCreate(query.trim())
    setOpen(false)
  }

  const handleChange = (e) => {
    const v = e.target.value
    setQuery(v)
    if (value) onSelect(null)
    setOpen(true)
  }

  const clear = () => {
    setQuery('')
    onSelect(null)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          {icon && (
            <Icon path={icon} size={1} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          )}
          <input
            type="text"
            className={icon ? 'pl-10' : ''}
            value={query}
            placeholder={placeholder}
            onChange={handleChange}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKey}
            autoComplete="off"
          />
        </div>
        {value && (
          <button type="button" onClick={clear} className="btn-secondary !p-2" title="Limpiar">
            <Icon path={mdiClose} size={0.9} />
          </button>
        )}
      </div>

      {open && (
        <div className="autocomplete-list">
          {shown.length === 0 && !showCreate && (
            <div className="autocomplete-item text-muted px-3 py-2 text-sm">Sin resultados</div>
          )}
          {shown.map((item, i) => (
            <div
              key={item.id}
              className={`autocomplete-item ${active === i ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                select(item)
              }}
              onMouseEnter={() => setActive(i)}
            >
              <Icon path={itemIcon} size={0.95} className={tableName === 'tipos' ? 'text-violet-400' : 'text-emerald-400'} />
              <span className="flex-1">{item.nombre}</span>
              {item.es_predefinida && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 bg-amber-500/15 rounded-full px-2 py-0.5">
                  <Icon path={mdiStar} size={0.55} /> estándar
                </span>
              )}
            </div>
          ))}
          {showCreate && (
            <div
              className={`autocomplete-item text-emerald-300 font-semibold ${active === shown.length ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                createNew()
              }}
              onMouseEnter={() => setActive(shown.length)}
            >
              <Icon path={mdiPlus} size={0.95} />
              Crear '{query.trim()}'
            </div>
          )}
        </div>
      )}
    </div>
  )
}
