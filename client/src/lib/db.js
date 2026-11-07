import Dexie from 'dexie'

class FoodTrackerDB extends Dexie {
  constructor() {
    super('foodtracker')
    this.version(1).stores({
      comidas: 'id, nombre, usuario_id, created_at, _sync',
      registros: 'id, comida_id, fecha_hora, usuario_id, _sync',
      tipos: 'id, nombre, es_predefinida, usuario_id, _sync',
      reacciones: 'id, tipo_reaccion_id, registro_comida_id, fecha_hora, usuario_id, _sync',
      pendingDeletes: '++_pk, tableName, id'
    })
    this.version(2).stores({
      comidas: 'id, nombre, usuario_id, created_at, _sync',
      registros: 'id, comida_id, fecha_hora, usuario_id, _sync',
      tipos: 'id, nombre, es_predefinida, usuario_id, _sync',
      reacciones: 'id, tipo_reaccion_id, registro_comida_id, fecha_hora, usuario_id, _sync',
      notas: 'id, usuario_id, fecha_hora, _sync',
      pendingDeletes: '++_pk, tableName, id'
    })
    this.version(3).stores({
      comidas: 'id, nombre, usuario_id, created_at, _sync',
      registros: 'id, comida_id, fecha_hora, usuario_id, _sync',
      tipos: 'id, nombre, es_predefinida, usuario_id, _sync',
      reacciones: 'id, tipo_reaccion_id, registro_comida_id, fecha_hora, usuario_id, _sync',
      notas: 'id, usuario_id, fecha_hora, _sync',
      vasos: 'id, usuario_id, fecha_hora, _sync',
      pendingDeletes: '++_pk, tableName, id'
    })
  }
}

export const db = new FoodTrackerDB()