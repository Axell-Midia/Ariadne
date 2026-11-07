// IA local con WebLLM (WebGPU en el navegador). El modelo se descarga la
// primera vez y queda en Cache Storage del propio navegador; después funciona
// sin conexión. El paquete se importa de forma dinámica para no inflar el
// bundle inicial (solo se carga al usar la pestaña de análisis).

const LS_MODELO = 'ft:ia-modelo'

export const MODELOS = [
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    nombre: 'Equilibrado',
    detalle: '≈1 GB · mejor análisis, recomendado'
  },
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    nombre: 'Liviano',
    detalle: '≈400 MB · más rápido y para equipos con poca memoria'
  }
]

export const MODELO_POR_DEFECTO = MODELOS[0].id

export function modeloGuardado() {
  const m = localStorage.getItem(LS_MODELO)
  return MODELOS.some((x) => x.id === m) ? m : MODELO_POR_DEFECTO
}

export function guardarModelo(id) {
  localStorage.setItem(LS_MODELO, id)
}

export async function webgpuDisponible() {
  if (typeof navigator === 'undefined' || !navigator.gpu) return false
  try {
    // algunos entornos cuelgan requestAdapter(); con timeout no bloqueamos la UI
    const adapter = await Promise.race([
      navigator.gpu.requestAdapter(),
      new Promise((r) => setTimeout(() => r('timeout'), 4000))
    ])
    if (adapter === 'timeout') return false
    return !!adapter
  } catch {
    return false
  }
}

export async function modeloDescargado(modelo) {
  try {
    const { hasModelInCache } = await import('@mlc-ai/web-llm')
    return await hasModelInCache(modelo)
  } catch {
    return false
  }
}

export async function borrarModelo(modelo) {
  const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm')
  if (motor && modeloCargado === modelo) {
    try { await motor.unload() } catch { /* ya descargado/suelto */ }
    motor = null
    modeloCargado = null
  }
  await deleteModelAllInfoInCache(modelo)
}

let motor = null
let modeloCargado = null

export async function cargarMotor(modelo, onProgreso) {
  const { CreateMLCEngine } = await import('@mlc-ai/web-llm')
  if (!motor) {
    motor = await CreateMLCEngine(modelo, {
      logLevel: 'WARN',
      initProgressCallback: onProgreso
    })
    modeloCargado = modelo
    return motor
  }
  motor.setInitProgressCallback(onProgreso)
  if (modeloCargado !== modelo) {
    await motor.reload(modelo)
    modeloCargado = modelo
  }
  return motor
}

const INSTRUCCION = [
  'Eres un asistente de salud que analiza el diario (comida, malestares y agua) de una persona. Respondes SIEMPRE en español claro y cercano.',
  '',
  'Responde exactamente con estos cuatro bloques, cada uno empezando por su título en negrita y con 2 a 4 viñetas cortas (en total, máximo 180 palabras):',
  '',
  '**Resumen del día** — qué registró hoy.',
  '**Posibles vínculos** — relaciones entre comida y malestares que sugieran los datos y su histórico; si no hay evidencia suficiente, dilo con honestidad.',
  '**Lo que destaca** — tendencias o anomalías frente a su histórico.',
  '**Sugerencias para mañana** — 2 o 3 acciones concretas y realistas basadas en lo registrado.',
  '',
  'Reglas: basaTODO en los datos provistos, no inventes datos ni síntomas; no des diagnósticos ni tratamientos; si los síntomas parecen serios o persistentes, recomienda consultar a un profesional de salud.'
].join('\n')

export async function analizar({ contexto, onToken }) {
  if (!motor) throw new Error('El modelo no está cargado')
  let salida = ''
  try {
    const stream = await motor.chat.completions.create({
      messages: [
        { role: 'system', content: INSTRUCCION },
        { role: 'user', content: contexto }
      ],
      stream: true,
      temperature: 0.4,
      max_tokens: 480
    })
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) {
        salida += delta
        onToken?.(salida)
      }
    }
  } catch (e) {
    // Si el usuario detuvo la generación (o falló a mitad), conservamos lo parcial
    if (salida) return salida
    throw e
  }
  return salida
}

export function detener() {
  try {
    motor?.interruptGenerate()
  } catch { /* sin generación activa */ }
}

export function mensajeDeError(e) {
  const m = String((e && e.message) || e)
  if (/device lost|OOM|out of memory|allocat/i.test(m)) {
    return 'El modelo no cabe en la memoria de tu dispositivo. Prueba con el modelo Liviano o cierra otras aplicaciones.'
  }
  if (/fetch|network|internet|Failed to load/i.test(m)) {
    return 'No se pudo descargar el modelo. Revisa tu conexión (la primera vez necesita descargarlo).'
  }
  if (/webgpu|adapter/i.test(m)) {
    return 'WebGPU no está disponible en este navegador.'
  }
  return m.slice(0, 220)
}
