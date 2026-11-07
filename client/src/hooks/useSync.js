import { useEffect, useRef, useState, useCallback } from 'react'
import { db } from '../lib/db.js'
import { supabase } from '../lib/supabase.js'

const TABLE_MAP = {
  comidas: 'comidas',
  registros: 'registros_comida',
  tipos: 'tipos_reaccion',
  reacciones: 'reacciones',
  notas: 'notas',
  vasos: 'vasos'
}

const DELETE_ORDER = ['reacciones', 'registros', 'comidas', 'tipos', 'notas', 'vasos']

let applyingRemote = false

function friendly(e) {
  const code = e?.code || ''
  const msg = e?.message || String(e)
  if (code === 'PGRST205' || /could not find the table/i.test(msg)) {
    return 'Falta una tabla en Supabase. Ejecuta los SQL de database/ (schema.sql, notas.sql y agua.sql).'
  }
  if (code === 'PGRST204' || /could not find the column/i.test(msg)) {
    return `Falta una columna en Supabase. Ejecuta las migraciones de database/ (p. ej. cantidad.sql). ${msg}`
  }
  if (code === '23503') return 'Hay registros vinculados que impiden la operación en Supabase.'
  if (code === '42501' || /row-level security/i.test(msg)) return 'Bloqueado por Row Level Security (RLS) en Supabase.'
  if (code === '42P01') return 'La tabla no existe en Supabase. Ejecuta los SQL de database/.'
  return msg
}

function pushError(list, local, op, e) {
  const entry = { table: TABLE_MAP[local] || local, op, message: friendly(e) }
  return [...list.filter((x) => `${x.op}:${x.table}` !== `${entry.op}:${entry.table}`), entry]
}

async function pushTable(local, remote) {
  const rows = await db.table(local).where('_sync').equals('pending').toArray()
  if (rows.length === 0) return

  const payload = rows.map(({ _sync, ...rest }) => rest)
  const { error } = await supabase.from(remote).upsert(payload, { onConflict: 'id' })
  if (error) throw error

  applyingRemote = true
  try {
    await db.table(local).bulkPut(rows.map((r) => ({ ...r, _sync: 'synced' })))
  } finally {
    applyingRemote = false
  }
}

async function pullTable(local, remote, userId) {
  let query = supabase.from(remote).select('*')
  if (local === 'tipos') query = query.or(`es_predefinida.eq.true,usuario_id.eq.${userId}`)
  else query = query.eq('usuario_id', userId)

  const { data, error } = await query
  if (error) throw error

  const rows = data || []

  // No pisar cambios locales que aún no se han subido
  const ids = rows.map((r) => r.id)
  const locales = ids.length ? await db.table(local).bulkGet(ids) : []
  const merged = rows
    .filter((row, i) => !(locales[i] && locales[i]._sync === 'pending'))
    .map((row) => ({ ...row, _sync: 'synced' }))

  // Borrar lo que ya no existe en la nube (borrado hecho en otro dispositivo)
  const sincronizadas = await db.table(local).where('_sync').equals('synced').toArray()
  const enNube = new Set(ids)
  const huerfanas = sincronizadas.filter((r) => !enNube.has(r.id)).map((r) => r.id)

  if (merged.length === 0 && huerfanas.length === 0) return

  applyingRemote = true
  try {
    if (merged.length) await db.table(local).bulkPut(merged)
    if (huerfanas.length) await db.table(local).bulkDelete(huerfanas)
  } finally {
    applyingRemote = false
  }
}

async function processDeletes(errors) {
  const pendientes = await db.pendingDeletes.toArray()
  const orden = [...pendientes].sort(
    (a, b) => DELETE_ORDER.indexOf(a.tableName) - DELETE_ORDER.indexOf(b.tableName)
  )

  for (const item of orden) {
    const remote = TABLE_MAP[item.tableName]
    if (!remote) {
      await db.pendingDeletes.delete(item._pk)
      continue
    }
    try {
      const { error } = await supabase
        .from(remote)
        .delete()
        .eq('id', item.id)
        .eq('usuario_id', item.usuarioId)
      if (error && error.code !== 'PGRST116') throw error

      applyingRemote = true
      try {
        await db.table(item.tableName).where('id').equals(item.id).delete()
        await db.pendingDeletes.delete(item._pk)
      } finally {
        applyingRemote = false
      }
    } catch (e) {
      // Se reintenta en el próximo sync; no aborta el resto
      errors = pushError(errors, item.tableName, 'borrar', e)
    }
  }
  return errors
}

export async function runSync(userId) {
  let errors = []

  errors = await processDeletes(errors)

  // Pull primero: aunque algo falle al subir, la nube se refleja en local
  for (const [local, remote] of Object.entries(TABLE_MAP)) {
    try {
      await pullTable(local, remote, userId)
    } catch (e) {
      errors = pushError(errors, local, 'recibir', e)
    }
  }

  for (const [local, remote] of Object.entries(TABLE_MAP)) {
    try {
      await pushTable(local, remote)
    } catch (e) {
      errors = pushError(errors, local, 'subir', e)
    }
  }

  return errors
}

function subscribeRealtime(userId, onEvent) {
  const channel = supabase.channel(`foodtracker-sync-${userId}`)
  for (const [local, remote] of Object.entries(TABLE_MAP)) {
    const cfg = { event: '*', schema: 'public', table: remote }
    if (local !== 'tipos') cfg.filter = `usuario_id=eq.${userId}`
    channel.on('postgres_changes', cfg, () => onEvent(local))
  }
  channel.subscribe((status) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn('[sync] Realtime no disponible; se usa el respaldo por intervalo.')
    }
  })
  return () => {
    supabase.removeChannel(channel)
  }
}

export function useSync(userId) {
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [syncErrors, setSyncErrors] = useState([])
  const running = useRef(false)
  const timer = useRef(null)
  const uidRef = useRef(userId)
  uidRef.current = userId

  const sync = useCallback(async () => {
    const uid = uidRef.current
    if (!uid || !navigator.onLine || running.current) return
    running.current = true
    setSyncing(true)
    try {
      const errs = await runSync(uid)
      setSyncErrors(errs)
      setLastSync(new Date())
    } catch (e) {
      setSyncErrors(pushError([], 'sync', 'sync', e))
    } finally {
      running.current = false
      setSyncing(false)
    }
  }, [])

  const schedule = useCallback(
    (ms = 1200) => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => sync(), ms)
    },
    [sync]
  )

  useEffect(() => {
    if (!userId) return

    sync()

    const onOnline = () => sync()
    const onOffline = () => {
      setSyncing(false)
      setSyncErrors([])
    }
    const onFocus = () => {
      if (!document.hidden) sync()
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)

    const interval = setInterval(() => {
      if (navigator.onLine) sync()
    }, 30000)

    let unsubChannel = null
    try {
      unsubChannel = subscribeRealtime(userId, (local) => {
        if (!navigator.onLine) return
        clearTimeout(timer.current)
        timer.current = setTimeout(async () => {
          try {
            await pullTable(local, TABLE_MAP[local], userId)
            setSyncErrors((prev) => prev.filter((x) => x.op !== 'recibir' || x.table !== TABLE_MAP[local]))
          } catch (e) {
            setSyncErrors((prev) => pushError(prev, local, 'recibir', e))
          }
        }, 400)
      })
    } catch (e) {
      console.warn('[sync] No se pudo suscribir a Realtime:', e.message)
    }

    // Dispara sync ante cualquier escritura local (comidas, notas, agua, etc.)
    const onLocalWrite = () => {
      if (!applyingRemote) schedule(1200)
    }
    const subs = []
    for (const name of Object.keys(TABLE_MAP)) {
      const table = db.table(name)
      for (const et of ['creating', 'updating', 'deleting']) {
        const ev = table.hook(et)
        ev.subscribe(onLocalWrite)
        subs.push([ev, onLocalWrite])
      }
    }

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
      clearInterval(interval)
      clearTimeout(timer.current)
      if (unsubChannel) unsubChannel()
      for (const [ev, fn] of subs) ev.unsubscribe(fn)
    }
  }, [userId, sync, schedule])

  return { syncing, lastSync, syncErrors, error: syncErrors[0]?.message || null, sync }
}
