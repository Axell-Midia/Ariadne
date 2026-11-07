import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9333
const DEV = 'http://localhost:5173'
const PROD = process.env.PROD_URL || ''
const STORAGE_KEY = 'sb-fzcobnvvencfjxuxwvlr-auth-token'
const USER_KEY = 'sb-fzcobnvvencfjxuxwvlr-auth-token-user'

const FAKE_SESSION = {
  access_token: 'fake.jwt.token.aaaa',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 2147483647,
  refresh_token: 'fake-refresh-token',
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'test@test.com',
    email_confirmed_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {}
  }
}

let seq = 0
let ws
const pending = new Map()

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evalJS(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('EXCEPTION: ' + JSON.stringify(r.exceptionDetails).slice(0, 400))
  return r.result.value
}

async function waitFor(expr, timeout = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      if (await evalJS(expr)) return true
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

const ok = (m) => console.log('PASS: ' + m)
const fail = (m) => { console.log('FAIL: ' + m); process.exitCode = 1 }

async function startEdge() {
  const uddir = mkdtempSync(join(tmpdir(), 'smoke-'))
  const child = spawn(EDGE, [
    '--headless=new', '--no-sandbox',
    '--enable-unsafe-webgpu', '--enable-features=Vulkan',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${uddir}`,
    'about:blank'
  ], { stdio: 'ignore' })
  let ready = false
  for (let i = 0; i < 40 && !ready; i++) {
    try { await fetch(`http://127.0.0.1:${PORT}/json/version`); ready = true } catch { await new Promise((r) => setTimeout(r, 250)) }
  }
  if (!ready) throw new Error('CDP no responde')
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
  }
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Network.enable')
  return { child, uddir }
}

async function stopEdge(child, uddir) {
  try { child.kill() } catch { }
  await new Promise((r) => setTimeout(r, 500))
  try { rmSync(uddir, { recursive: true, force: true }) } catch { }
}

async function goto(url) {
  await send('Page.navigate', { url })
  await waitFor(`document.readyState === 'complete'`)
}

async function seedSessionAndReload(rootCheck) {
  await evalJS(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(FAKE_SESSION))})`)
  await evalJS(`localStorage.setItem(${JSON.stringify(USER_KEY)}, ${JSON.stringify(JSON.stringify({ user: FAKE_SESSION.user }))})`)
  await evalJS('location.reload()')
  if (!(await waitFor(rootCheck, 20000))) throw new Error('UI no montó tras sembrar sesión')
}

async function createNote(text) {
  await evalJS(`(() => {
    const el = document.querySelector('.card textarea');
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    set.call(el, ${JSON.stringify(text)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.card .relative > button').click();
  })()`)
}

async function runOnlineNotesTest() {
  await goto(DEV)
  if (!(await waitFor(`!!document.querySelector('#root > div')`))) throw new Error('app no montó (dev)')
  ok('app online monta')

  await evalJS(`(async () => {
    const { db } = await import('/src/lib/db.js');
    const predef = ['Dolor de estómago','Náuseas','Acidez / reflujo','Hinchazón','Alergia / reacción en piel','Fatiga','Dolor de cabeza','Mareos','Diarrea','Estreñimiento','Gases','Cólicos'];
    for (const nombre of predef) {
      const existe = await db.tipos.filter((t) => t.es_predefinida && t.nombre === nombre).first();
      if (!existe) await db.tipos.put({ id: crypto.randomUUID(), nombre, es_predefinida: true, usuario_id: null, _sync: 'synced' });
    }
  })()`)
  ok('predefinidas sembradas localmente')

  await seedSessionAndReload(`Array.from(document.querySelectorAll('nav button')).some(b => b.textContent.includes('Notas'))`)
  ok('sesión sembrada y UI principal visible (dev)')

  await evalJS(`Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Notas')).click()`)
  if (!(await waitFor(`document.body.innerText.includes('Notas del día')`))) throw new Error('pestaña Notas no renderiza')
  ok('pestaña Notas renderiza')

  await createNote('Dolor de cabeza todo el dia')
  if (!(await waitFor(`document.body.innerText.includes('Dolor de cabeza todo el dia')`))) throw new Error('nota no se creó')
  ok('nota creada con hora automática')

  await evalJS(`[...document.querySelectorAll('button[title="Editar"]')].at(-1).click()`)
  if (!(await waitFor(`!!document.querySelector('.card textarea:not([placeholder])')`))) throw new Error('editor no abrió')
  await evalJS(`(() => {
    const el = document.querySelector('.card textarea:not([placeholder])');
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    set.call(el, 'Dolor de cabeza todo el dia actualizado');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Guardar')).click();
  })()`)
  if (!(await waitFor(`document.body.innerText.includes('actualizado')`))) throw new Error('edición no se guardó')
  ok('nota editada')

  await evalJS(`window.confirm = () => true`)
  await evalJS(`[...document.querySelectorAll('button[title="Eliminar"]')].at(-1).click()`)
  await new Promise((r) => setTimeout(r, 800))
  if (await evalJS(`document.body.innerText.includes('actualizado')`)) fail('nota no se eliminó')
  else ok('nota eliminada')
}

async function runOnlineAguaTest() {
  await evalJS(`window.confirm = () => true`)
  await evalJS(`Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Agua')).click()`)
  if (!(await waitFor(`document.body.innerText.includes('Agua del día')`))) throw new Error('pestaña Agua no renderiza')
  ok('pestaña Agua renderiza')

  if (!(await waitFor(`document.body.innerText.includes('0 / 8 vasos')`))) throw new Error('contador de vasos no inicia en 0')
  ok('muestra 0 / 8 vasos')

  await evalJS(`document.querySelector('button[title^="Rellenar vaso 1"]').click()`)
  if (!(await waitFor(`document.body.innerText.includes('1 / 8 vasos')`))) throw new Error('vaso no se rellenó')
  if (await evalJS(`!!document.querySelector('input[placeholder*="con limón"]')`)) fail('el panel de tipo NO debería abrirse automáticamente al rellenar')
  else ok('clic en vaso vacío lo rellena al instante (sin panel)')

  await evalJS(`[...document.querySelectorAll('button[title="Editar hora o tipo"]')][0].click()`)
  if (!(await waitFor(`!!document.querySelector('input[placeholder*="con limón"]')`))) throw new Error('modal de edición no abrió')
  await evalJS(`(() => {
    const el = document.querySelector('input[placeholder*="con limón"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, 'con limón');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Guardar')).click();
  })()`)
  if (!(await waitFor(`document.body.innerText.includes('· con limón')`))) throw new Error('tipo no se guardó')
  ok('tipo de agua guardado desde el modal')

  await evalJS(`[...document.querySelectorAll('button[title="Editar hora o tipo"]')][0].click()`)
  if (!(await waitFor(`!!document.querySelector('input[placeholder*="con limón"]')`))) throw new Error('modal de edición no reabrió')
  await evalJS(`(() => {
    const el = document.querySelector('input[placeholder*="con limón"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, 'agua mineral');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Guardar')).click();
  })()`)
  if (!(await waitFor(`document.body.innerText.includes('· agua mineral')`))) throw new Error('edición de tipo no se guardó')
  ok('tipo editado desde el modal')

  await evalJS(`document.querySelector('button[title="Vaciar"]').click()`)
  if (!(await waitFor(`document.body.innerText.includes('0 / 8 vasos')`))) throw new Error('vaso no se vació')
  ok('vaso vaciado (deshacer)')
}

function seleccionarTipoReaccion(nombre) {
  return evalJS(`(() => {
    const clear = document.querySelector('button[title="Limpiar"]');
    if (clear) clear.click();
    const input = document.querySelector('input[placeholder*="Dolor de estómago"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, ${JSON.stringify(nombre)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`).then(() => evalJS(`(async () => {
    const deadline = Date.now() + 8000;
    const isCrear = (el) => el.textContent.includes("Crear '");
    let item = null;
    while (Date.now() < deadline) {
      const it = [...(document.querySelectorAll('.autocomplete-item') || [])];
      item = it.find(el => el.textContent.includes(${JSON.stringify(nombre)}) && !isCrear(el)) || null;
      if (item) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!item) {
      const it = [...(document.querySelectorAll('.autocomplete-item') || [])];
      item = it.find(el => isCrear(el)) || null;
    }
    if (!item) throw new Error('opción de autocomplete no apareció');
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  })()`))
}

async function runOnlineCabezaTest() {
  await evalJS(`Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Registrar')).click()`)

  await seleccionarTipoReaccion('Hinchazón')
  await new Promise((r) => setTimeout(r, 500))
  if (await evalJS(`!!document.querySelector('g[role="button"]')`)) fail('la cara NO debería aparecer en Hinchazón')
  else ok('en un malestar no-cabeza NO aparece la cara')
  if (!(await evalJS(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Fuerte')`))) fail('severidad no visible en Hinchazón')
  else ok('severidad visible aunque no sea dolor de cabeza')

  await seleccionarTipoReaccion('Dolor de cabeza')
  if (!(await waitFor(`!!document.querySelector('g[role="button"][aria-label="Coronilla"]')`, 15000))) throw new Error('la cara de zonas no apareció')
  if (!(await evalJS(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Fuerte')`))) throw new Error('severidad no visible en dolor de cabeza')
  ok('al elegir Dolor de cabeza aparece la cara y la severidad')

  const sevActiva = await evalJS(`document.querySelector('.severidad-active')?.textContent.trim()`)
  if (sevActiva !== 'Leve') fail(`severidad por defecto debería ser Leve, es ${sevActiva}`)
  else ok('severidad por defecto: Leve')

  if (!(await evalJS(`!!document.querySelector('g[role="button"][aria-label="Nuca"]')`))) throw new Error('la zona Nuca (vista atrás) no existe')
  await evalJS(`document.querySelector('g[role="button"][aria-label="Nuca"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await evalJS(`document.querySelector('g[role="button"][aria-label="Sien izquierda"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  if (!(await waitFor(`document.body.innerText.includes('2 marcadas')`))) throw new Error('zonas no se marcaron')
  ok('se pueden marcar Nuca (atrás) y Sien izquierda')

  await evalJS(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Registrar Dolor de cabeza')).click()`)
  if (!(await waitFor(`document.body.innerText.includes('2 zonas marcadas')`))) throw new Error('reacción con zonas no se guardó')
  ok('reacción guardada con 2 zonas')

  await evalJS(`Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Historial')).click()`)
  if (!(await waitFor(`document.body.innerText.includes('2 zonas marcadas') && document.body.innerText.includes('Nuca')`, 15000))) throw new Error('Historial no muestra las zonas')
  if (!(await evalJS(`!!document.querySelector('svg[role="img"][aria-label="Cabeza vista posterior"]')`))) throw new Error('mini-cabeza posterior no aparece en Historial')
  ok('Historial muestra mini-cabeza (incluye vista posterior) con los nombres')
}

async function registrarComida(nombre) {
  await evalJS(`(() => {
    const input = document.querySelector('input[placeholder*="Arroz con pollo"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, ${JSON.stringify(nombre)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await evalJS(`(() => {
    const card = document.querySelector('input[placeholder*="Arroz con pollo"]').closest('.card');
    const crear = [...card.querySelectorAll('.autocomplete-item')].find(el => el.textContent.includes("Crear '"));
    if (!crear) throw new Error('opción crear comida no apareció');
    crear.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    crear.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  })()`)
  if (!(await waitFor(`!![...document.querySelectorAll('button')].find(b => b.textContent.includes('Registrar ${nombre}') && !b.disabled)`, 8000))) {
    throw new Error(`botón registrar ${nombre} no apareció`)
  }
  await evalJS(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Registrar ${nombre}')).click()`)
}

async function runOnlinePatronesTest() {
  await evalJS(`Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Registrar')).click()`)
  await registrarComida('Café con leche')
  await new Promise((r) => setTimeout(r, 400))
  ok('comida registrada para el patrón')

  await seleccionarTipoReaccion('Dolor de cabeza')
  if (!(await waitFor(`!!document.querySelector('g[role="button"][aria-label="Frente"]')`, 15000))) throw new Error('cara no apareció')
  await evalJS(`document.querySelector('g[role="button"][aria-label="Frente"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`)

  if (!(await waitFor(`!![...document.querySelectorAll('button')].find(b => b.textContent.includes('Café con leche') && b.textContent.includes('·'))`, 8000))) {
    throw new Error('chip de comida de hoy no apareció')
  }
  await evalJS(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Café con leche') && b.textContent.includes('·')).click()`)
  ok('reacción asociada a la comida de hoy')

  await evalJS(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Registrar Dolor de cabeza')).click()`)
  if (!(await waitFor(`document.body.innerText.includes('asociada a comida')`))) throw new Error('reacción vinculada no se guardó')

  await evalJS(`Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Stats')).click()`)
  if (!(await waitFor(`document.body.innerText.includes('Patrones comida → reacción')`, 15000))) throw new Error('card de Patrones no renderiza')
  const statsTxt = await evalJS(`document.body.innerText`)
  if (!statsTxt.includes('Café con leche') || !statsTxt.includes('Dolor de cabeza')) throw new Error('el patrón comida→reacción no aparece')
  if (!statsTxt.includes('vez')) throw new Error('el patrón no muestra el conteo de veces')
  ok('Stats muestra el patrón Café con leche → Dolor de cabeza')
}

async function runOfflineBootTest() {
  await goto(PROD)
  await waitFor(`document.readyState === 'complete'`)
  ok('producción cargada online (shell + SW)')

  await seedSessionAndReload(`Array.from(document.querySelectorAll('nav button')).some(b => b.textContent.includes('Notas'))`)
  if (!(await waitFor(`navigator.serviceWorker && !!navigator.serviceWorker.controller`, 20000))) throw new Error('SW no controla la página')
  ok('service worker activo y sesión cacheada (online)')

  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
    connectionType: 'none'
  })
  await evalJS('location.reload()')
  const start = Date.now()
  if (!(await waitFor(`Array.from(document.querySelectorAll('nav button')).some(b => b.textContent.includes('Notas'))`, 12000))) {
    throw new Error('con offline la app no llegó a montar (posible bloqueo en "Cargando")')
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  const sigueCargando = await evalJS(`document.body.innerText.includes('Cargando')`)
  ok(`app arranca OFFLINE con sesión cacheada en ${elapsed}s; en pantalla: ${sigueCargando ? 'Cargando... (fallo)' : 'UI principal'} `)
  if (sigueCargando) fail('se quedó en Cargando...')

  await evalJS(`Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Notas')).click()`)
  if (!(await waitFor(`document.body.innerText.includes('Notas del día')`))) throw new Error('Notas no renderiza offline')
  await createNote('nota offline de prueba')
  if (!(await waitFor(`document.body.innerText.includes('nota offline de prueba')`))) throw new Error('nota offline no se guardó local')
  ok('nota CREADA offline y guardada localmente (Dexie)')

  await evalJS(`Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Agua')).click()`)
  if (!(await waitFor(`document.body.innerText.includes('Agua del día')`))) throw new Error('Agua no renderiza offline')
  await evalJS(`document.querySelector('button[title^="Rellenar vaso 1"]').click()`)
  if (!(await waitFor(`document.body.innerText.includes('1 / 8 vasos')`))) throw new Error('vaso offline no se rellenó')
  ok('vaso CREADO offline y guardado localmente (Dexie)')

  await evalJS(`Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Registrar')).click()`)
  await seleccionarTipoReaccion('Dolor de cabeza')
  if (!(await waitFor(`!!document.querySelector('g[role="button"][aria-label="Frente"]')`, 12000))) throw new Error('cara no aparece offline')
  await evalJS(`document.querySelector('g[role="button"][aria-label="Frente"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await evalJS(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Registrar Dolor de cabeza')).click()`)
  if (!(await waitFor(`document.body.innerText.includes('1 zona marcada')`))) throw new Error('reacción con zona no se guardó offline')
  ok('reacción con zona marcada CREADA offline (Dexie)')

  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'wifi' })
  ok('red restaurada (la sincronización se reanuda sola vía evento online)')
}

async function runOnlineCantidadTest() {
  await evalJS(`Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Registrar')).click()`)
  await evalJS(`(() => {
    const input = document.querySelector('input[placeholder*="Arroz con pollo"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, 'Café con leche');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await evalJS(`(async () => {
    const deadline = Date.now() + 8000;
    let item = null;
    while (Date.now() < deadline) {
      const items = [...document.querySelectorAll('.autocomplete-item')];
      item = items.find(el => el.textContent.includes('Café con leche') && !el.textContent.includes("Crear '")) || null;
      if (item) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!item) throw new Error('item comida no apareció');
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  })()`)
  if (!(await waitFor(`!!document.querySelector('button[title="Aumentar cantidad"]')`, 8000))) throw new Error('stepper de cantidad no aparece')
  if ((await evalJS(`document.querySelector('[data-cantidad]')?.textContent.trim()`)) !== '1') fail('cantidad inicial debe ser 1')

  await evalJS(`document.querySelector('button[title="Aumentar cantidad"]').click()`)
  await evalJS(`document.querySelector('button[title="Aumentar cantidad"]').click()`)
  if ((await evalJS(`document.querySelector('[data-cantidad]')?.textContent.trim()`)) !== '3') fail('cantidad no sube con el contador')
  ok('contador de cantidad llega a 3')

  await evalJS(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Registrar Café con leche') && !b.disabled).click()`)
  if (!(await waitFor(`document.body.innerText.includes('×3')`, 8000))) throw new Error('mensaje de guardado no muestra ×3')
  ok('registro guardado con cantidad 3 (se muestra ×3)')

  await evalJS(`Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Historial')).click()`)
  if (!(await waitFor(`document.body.innerText.includes('×3')`, 8000))) throw new Error('Historial no muestra la cantidad')
  ok('Historial muestra la cantidad (×3)')
}

async function runOnlineEdicionTest() {
  const hoyKey = await evalJS(`(() => {
    const h = new Date();
    return \`\${h.getFullYear()}-\${String(h.getMonth() + 1).padStart(2, '0')}-\${String(h.getDate()).padStart(2, '0')}\`;
  })()`)

  await evalJS(`([...document.querySelectorAll('button[title="Editar"]')].find(b => b.closest('[data-entry]').innerText.includes('×3'))).click()`)
  if (!(await waitFor(`document.body.innerText.includes('Editar comida')`))) throw new Error('modal editar comida no abrió')
  if ((await evalJS(`document.querySelector('[data-cantidad]')?.textContent.trim()`)) !== '3') fail('cantidad inicial en editor debe ser 3')
  ok('modal de editar comida abre con datos actuales')

  await evalJS(`document.querySelector('button[title="Disminuir cantidad"]').click()`)
  if ((await evalJS(`document.querySelector('[data-cantidad]')?.textContent.trim()`)) !== '2') fail('cantidad no baja a 2 en el editor')
  ok('cantidad editable en el editor')

  await evalJS(`([...document.querySelectorAll('button[title="Limpiar"]')])[0].click()`)
  await evalJS(`(() => {
    const input = document.querySelector('input[placeholder*="Café con leche"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, 'Pan');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await evalJS(`(async () => {
    const deadline = Date.now() + 8000;
    let target = null;
    while (Date.now() < deadline && !target) {
      target = [...(document.querySelectorAll('.autocomplete-item') || [])].find(el => el.textContent.includes("Crear 'Pan'"));
      if (!target) await new Promise((r) => setTimeout(r, 150));
    }
    if (!target) throw new Error('crear Pan no apareció');
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  })()`)
  if (!(await waitFor(`document.querySelector('input[placeholder*="Café con leche"]')?.value === 'Pan'`, 8000))) throw new Error('la selección de Pan no se aplicó')

  await evalJS(`(() => {
    const input = document.querySelector('input[type="datetime-local"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, ${JSON.stringify(`${hoyKey}T13:37`)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`)

  if (!(await waitFor(`!![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Guardar' && !b.disabled)`, 8000))) {
    const st = await evalJS(`JSON.stringify({ pan: document.body.innerText.includes('Pan'), disabled: [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Guardar')?.disabled })`)
    throw new Error('Guardar nunca se habilitó tras crear Pan; DIAG=' + st)
  }
  await evalJS(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Guardar').click()`)
  if (!(await waitFor(`document.body.innerText.includes('Pan') && !document.body.innerText.includes('Editar comida')`, 10000))) {
    const diag = await evalJS(`JSON.stringify({
      modal: document.body.innerText.includes('Editar comida'),
      pan: document.body.innerText.includes('Pan'),
      value: document.querySelector('input[placeholder*="Café con leche"]')?.value || null,
      fecha: document.querySelector('input[type="datetime-local"]')?.value || null,
      errorVisible: [...document.querySelectorAll('*')].some(el => el.textContent.trim().toLowerCase().includes('error') && el.children.length === 0),
      guardarDisabled: [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Guardar')?.disabled
    })`)
    throw new Error('edición de comida no se guardó; DIAG=' + diag)
  }
  if (!(await waitFor(`document.body.innerText.includes('×2') && document.body.innerText.includes('13:37')`, 10000))) throw new Error('Historial no refleja la comida editada')
  ok('comida editada: Pan ×2 a las 13:37')

  await evalJS(`([...document.querySelectorAll('button[title="Editar"]')].find(b => {
    const t = b.closest('[data-entry]').innerText;
    return t.includes('Dolor de cabeza') && t.includes('2 zonas');
  })).click()`)
  if (!(await waitFor(`document.body.innerText.includes('Editar malestar')`))) throw new Error('modal editar malestar no abrió')
  ok('modal de editar malestar abre')

  await evalJS(`([...document.querySelectorAll('button[title="Limpiar"]')])[0].click()`)
  await evalJS(`(() => {
    const input = document.querySelector('input[placeholder*="Dolor de estómago"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, 'Hinchazón');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await evalJS(`(async () => {
    const deadline = Date.now() + 8000;
    let target = null;
    while (Date.now() < deadline && !target) {
      target = [...(document.querySelectorAll('.autocomplete-item') || [])].find(el => el.textContent.includes('Hinchazón') && !el.textContent.includes("Crear '"));
      if (!target) await new Promise((r) => setTimeout(r, 150));
    }
    if (!target) throw new Error('item Hinchazón no apareció');
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  })()`)

  await evalJS(`(() => {
    const input = document.querySelector('input[type="datetime-local"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, ${JSON.stringify(`${hoyKey}T23:59`)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`)
  if (!(await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Pan') && b.textContent.includes('·'))`))) throw new Error('chip Pan no aparece en el editor de malestar')
  await evalJS(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Pan') && b.textContent.includes('·')).click()`)
  await evalJS(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Guardar').click()`)
  if (!(await waitFor(`document.body.innerText.includes('Hinchazón') && !document.body.innerText.includes('Editar malestar')`, 10000))) throw new Error('edición de malestar no se guardó')
  if (!(await waitFor(`document.body.innerText.includes('23:59') && document.body.innerText.includes('a Pan')`, 10000))) throw new Error('Historial no refleja el malestar editado')
  if (await evalJS(`document.body.innerText.includes('zonas marcadas')`)) fail('las zonas no se limpiaron al cambiar a un tipo no-cabeza')
  else ok('malestar editado: Hinchazón a las 23:59 vinculado a Pan')
}

async function runOnlineLimpiezaTest() {
  await evalJS(`Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Registrar')).click()`)

  const createTipo = async (nombre) => {
    await evalJS(`(() => {
      const input = document.querySelector('input[placeholder*="Dolor de estómago"]');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(input, ${JSON.stringify(nombre)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`)
    await evalJS(`(() => {
      const item = [...document.querySelectorAll('.autocomplete-item')].find(el => el.textContent.includes(${JSON.stringify(`Crear '${nombre}'`)}));
      if (!item) throw new Error(${JSON.stringify(`crear ${nombre} no apareció`)});
      item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    })()`)
  }

  await createTipo('Mareos')
  if (!(await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Registrar Mareos')`, 8000))) {
    throw new Error('el duplicado Mareos no se creó')
  }
  await evalJS(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Registrar Mareos').click()`)
  if (!(await waitFor(`document.body.innerText.includes('Mareos') && !document.body.innerText.includes('Registrar Mareos')`, 8000))) {
    throw new Error('la reacción con el duplicado Mareos no se guardó')
  }

  await createTipo('mareo')
  if (!(await waitFor(`[...document.querySelectorAll('button[title="Limpieza temporal"]')].some(b => b.textContent.includes('(2)'))`, 8000))) {
    const txt = await evalJS(`document.querySelector('button[title="Limpieza temporal"]')?.textContent.trim() || 'SIN BOTÓN'`)
    const diag = await evalJS(`(async () => {
      const { db } = await import('/src/lib/db.js');
      const [tipos, reacciones] = await Promise.all([db.tipos.toArray(), db.reacciones.toArray()]);
      const usados = new Set(reacciones.map(r => r.tipo_reaccion_id));
      const canon = new Map();
      for (const t of tipos) if (t.es_predefinida) canon.set(t.nombre.trim().toLowerCase(), t);
      const cands = tipos.filter(t => !t.es_predefinida && ((canon.get(t.nombre.trim().toLowerCase()) && canon.get(t.nombre.trim().toLowerCase()).id !== t.id) || !usados.has(t.id))).map(t => t.nombre);
      return JSON.stringify({ cands, totalTipos: tipos.length, tipos: tipos.map(t => ({ n: t.nombre, p: !!t.es_predefinida })) });
    })()`)
    throw new Error('el botón de limpieza no muestra 2 candidatos; botón=' + txt + '; DIAG=' + diag)
  }
  ok('helper de limpieza aparece con el duplicado Mareos y el mareo sin uso (2)')

  await evalJS(`document.querySelector('button[title="Limpieza temporal"]').click()`)
  if (!(await waitFor(`document.body.innerText.includes('Hecho:') && document.body.innerText.includes('Mareos → estándar (1 malestar movido)') && document.body.innerText.includes('mareo (eliminado, sin uso)')`, 8000))) {
    const txt = await evalJS(`[...document.querySelectorAll('div')].map(d => d.textContent).find(t => t.startsWith('Hecho:') || t.startsWith('Nada')) || 'SIN MENSAJE'`)
    throw new Error('la limpieza no reportó la fusión al estándar; MENSAJE=' + txt)
  }
  if (await evalJS(`!!document.querySelector('button[title="Limpieza temporal"]')`)) fail('el botón debería desaparecer tras corregir')
  else ok('duplicado Mareos fusionado al estándar y mareo sin uso eliminado; el botón desaparece')

  await evalJS(`(() => {
    const input = document.querySelector('input[placeholder*="Dolor de estómago"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, 'Mareos');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  if (!(await waitFor(`[...document.querySelectorAll('.autocomplete-item')].some(el => el.textContent.includes('Mareos') && el.textContent.includes('estándar'))`, 8000))) {
    throw new Error('no queda el Mareos estándar en el autocomplete')
  }
  if (await evalJS(`[...document.querySelectorAll('.autocomplete-item')].some(el => el.textContent.includes("Crear 'Mareos'"))`)) fail('el duplicado Mareos sigue sugerible de crear')
  else ok('autocomplete: solo queda el Mareos estándar')

  await evalJS(`Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('Historial')).click()`)
  if (await waitFor(`document.body.innerText.includes('Mareos')`, 8000)) ok('Historial conserva el malestar Mareos tras la fusión')
  else fail('Historial perdió el malestar Mareos tras la fusión')
}

async function runResumenIaTest() {
  await evalJS(`Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('IA')).click()`)
  if (!(await waitFor(`document.body.innerText.includes('Análisis de tu día')`, 8000))) {
    throw new Error('la pestaña IA no renderizó la tarjeta de análisis')
  }
  ok('pestaña IA renderiza')

  const st = JSON.parse(await evalJS(`JSON.stringify({
    boton: !![...document.querySelectorAll('button')].find(b => b.textContent.includes('Analizar mi día')),
    selector: !![...document.querySelectorAll('button')].find(b => b.textContent.includes('Equilibrado')) && !![...document.querySelectorAll('button')].find(b => b.textContent.includes('Liviano')),
    avisoWebgpu: document.body.innerText.includes('WebGPU'),
    chips: ['comidas', 'malestares', 'vasos', 'notas'].every(t => document.body.innerText.includes(t))
  })`))
  if (!st.chips) throw new Error('faltan los contadores del día en la tarjeta; DIAG=' + JSON.stringify(st))
  ok('contadores del día visibles (comidas / malestares / vasos / notas)')

  if (st.boton) {
    if (!st.selector) throw new Error('con WebGPU disponible falta el selector de modelos; DIAG=' + JSON.stringify(st))
    ok('botón "Analizar mi día" y selector de modelo (Equilibrado / Liviano) visibles (WebGPU disponible)')
  } else if (st.avisoWebgpu) {
    ok('sin WebGPU en el navegador: se muestra el aviso explicativo en lugar del botón')
  } else {
    throw new Error('ni botón de análisis ni aviso de WebGPU; DIAG=' + JSON.stringify(st))
  }

  if (!PROD) {
    const ctx = JSON.parse(await evalJS(`import('/src/lib/resumen.js').then(async (m) => {
      const r = await m.construirContexto('${FAKE_SESSION.user.id}')
      return JSON.stringify({ vacio: r.vacio, delDia: r.delDia, texto: r.texto })
    })`))
    if (ctx.vacio) throw new Error('el contexto de IA sale vacío habiendo registros hoy; DIAG=' + JSON.stringify(ctx.delDia))
    if (!ctx.texto.includes('FECHA:') || !ctx.texto.includes('COMIDAS DE HOY') || !ctx.texto.includes('HISTÓRICO')) {
      throw new Error('el contexto no tiene las secciones esperadas; texto=' + ctx.texto.slice(0, 300))
    }
    if (ctx.delDia.comidas < 1 || ctx.delDia.malestares < 1) {
      throw new Error('conteos del día insuficientes en el contexto; DIAG=' + JSON.stringify(ctx.delDia))
    }
    ok('contexto de IA construido con FECHA, comidas del día e histórico (30 días)')
    ok('conteos del día correctos en el contexto (comidas y malestares ≥ 1)')
  }
}

let { child, uddir } = await startEdge()
try {
  await runOnlineNotesTest()
  await runOnlineAguaTest()
  await runOnlineCabezaTest()
  await runOnlinePatronesTest()
  await runOnlineCantidadTest()
  await runOnlineEdicionTest()
  await runOnlineLimpiezaTest()
  await runResumenIaTest()
  if (PROD) await runOfflineBootTest()
  console.log('RESUMEN: smoke test completado' + (PROD ? ' (online + offline)' : ' (online)'))
} catch (e) {
  console.log('FAIL: ' + e.message)
  process.exitCode = 1
} finally {
  await stopEdge(child, uddir)
  process.exit()
}