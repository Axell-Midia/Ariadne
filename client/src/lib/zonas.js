export const ZONAS = [
  { code: 'coronilla', label: 'Coronilla', view: 'frontal' },
  { code: 'frente', label: 'Frente', view: 'frontal' },
  { code: 'sien_izq', label: 'Sien izquierda', view: 'frontal' },
  { code: 'sien_der', label: 'Sien derecha', view: 'frontal' },
  { code: 'ojo_izq', label: 'Encima del ojo izq', view: 'frontal' },
  { code: 'ojo_der', label: 'Encima del ojo der', view: 'frontal' },
  { code: 'nuca', label: 'Nuca', view: 'atras' },
  { code: 'cuello', label: 'Cuello', view: 'atras' }
]

export const zonaLabel = (code) => ZONAS.find((z) => z.code === code)?.label || code

export const zonaLabels = (zonas = []) => zonas.map(zonaLabel)

export const ES_DOLOR_CABEZA = /dolor de cabeza|cabeza|migrañ|cefalea/i