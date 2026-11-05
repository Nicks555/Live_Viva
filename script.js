'use strict';
const $ = id => document.getElementById(id);

const products = [
  { id:1, name:'Internet Hogar', desc:'Plan hogar para demostración', price:199, icon:'⌂' },
  { id:2, name:'Combo Prepago', desc:'Paquete de datos y llamadas', price:35, icon:'▣' },
  { id:3, name:'Internet Móvil', desc:'Bolsa de datos para navegar', price:50, icon:'◈' }
];
let stock = {1:12, 2:20, 3:15};
let stream = null, cameraStream = null, screenStream = null;
let recorder = null, chunks = [], recording = false;
let live = false, muted = false, camOff = false;
let started = 0, elapsed = 0, likes = 0, comments = 0;
let orders = JSON.parse(localStorage.getItem('vivaOrders') || '[]');
let logs = [], cameraFacing = 'user', tick = null, typingLast = 0;

const safe = s => String(s).replace(/[&<>"']/g, c => (
  {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
));

function toast(t){
  $('toast').textContent = t;
  $('toast').classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $('toast').classList.remove('show'), 3000);
}

function log(type, message){
  logs.unshift({ type, message, time: new Date().toLocaleTimeString('es-BO') });
  logs = logs.slice(0, 350);
  renderLogs();
}

function renderLogs(){
  const f = $('logFilter').value;
  $('logs').innerHTML = logs
    .filter(l => !f || l.type === f)
    .map(l => `<div class="log"><time>${safe(l.time)}</time> <b>${safe(l.type.toUpperCase())}</b> ${safe(l.message)}</div>`)
    .join('') || '<p class="muted">No hay eventos para mostrar.</p>';
}

function renderProducts(){
  const box = $('products');
  box.innerHTML = products.map(p => `
    <article class="product">
      <span class="symbol">${p.icon}</span>
      <h3>${safe(p.name)}</h3>
      <p>${safe(p.desc)}</p>
      <div class="price">Bs ${p.price} <small>· ${stock[p.id] ?? 10} disponibles</small></div>
      <button class="btn primary" data-prod="${p.id}">Destacar en Live</button>
    </article>`).join('');
  $('variantSelect').innerHTML = products
    .map(p => `<option value="${p.id}">${safe(p.name)} — Bs ${p.price}</option>`)
    .join('');
}

function renderOrders(){
  $('orderCount').textContent = orders.length;
  $('orderList').innerHTML = orders.length
    ? orders.slice().reverse().slice(0, 15).map(o => `
        <div class="order">
          <span><b>${safe(o.client)}</b> · ${safe(o.product)}<br>
            <span class="muted">${safe(o.time)} ${o.contact ? '· ' + safe(o.contact) : ''}</span>
          </span>
          <b>Bs ${o.price}</b>
        </div>`).join('')
    : '<p class="muted">Aún no hay pedidos.</p>';
}

function format(sec){
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor(sec % 3600 / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function refreshClock(){
  const seconds = live ? Math.floor((Date.now() - started) / 1000) : elapsed;
  $('timer').textContent = format(seconds);
  $('sessionTime').textContent = format(seconds).slice(3);
}

async function activateCamera(){
  if (!navigator.mediaDevices?.getUserMedia){
    toast('Abre esta página en HTTPS o localhost para usar cámara');
    return false;
  }
  try {
    if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: cameraFacing }, audio: true
    });
    stream = cameraStream;
    $('video').srcObject = stream;
    $('video').classList.add('visible');
    $('empty').hidden = true;
    $('empty').style.display = 'none';
    muted = false; camOff = false;
    updateDeviceLabels();
    log('sistema', 'Cámara y micrófono habilitados');
    toast('Cámara y micrófono conectados');
    return true;
  } catch (err) {
    log('sistema', 'No se pudo activar cámara: ' + err.name);
    toast('Permite acceso a cámara y micrófono en el navegador');
    return false;
  }
}

function updateDeviceLabels(){
  $('micBtn').textContent = muted ? '🔇 Micrófono apagado' : '🎙 Micrófono activo';
  $('camBtn').textContent = camOff ? '📷 Cámara apagada' : '📷 Cámara activa';
}

function endTracks(){
  [cameraStream, screenStream].forEach(s => s?.getTracks().forEach(t => t.stop()));
  cameraStream = null; screenStream = null; stream = null;
  $('video').srcObject = null;
  $('video').classList.remove('visible');
  $('empty').hidden = false;
  $('empty').style.display = 'flex';
}

function stopRecording(){
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recording = false;
  $('recordBtn').textContent = '⏺ Grabar';
}

function finish(){
  if (!live) return;
  elapsed = Math.floor((Date.now() - started) / 1000);
  live = false;
  clearInterval(tick);
  stopRecording();
  $('startBtn').disabled = false;
  $('stopBtn').disabled = true;
  $('status').textContent = '● FINALIZADA';
  $('status').classList.remove('active');
  $('liveBadge').textContent = '● PREVIA';
  $('viewers').textContent = '0';
  refreshClock();
  log('sistema', 'Sesión local finalizada');
  toast('Sesión finalizada');
}

/* ---------- Menú drawer lateral ---------- */
const nav = $('nav');
const navOverlay = $('navOverlay');
const menuBtn = $('menuBtn');

function openNav(){
  nav.classList.add('open');
  navOverlay.classList.add('show');
  document.body.classList.add('navOpen');
  menuBtn.setAttribute('aria-expanded', 'true');
  menuBtn.textContent = '✕';
  navOverlay.setAttribute('aria-hidden', 'false');
}
function closeNav(){
  nav.classList.remove('open');
  navOverlay.classList.remove('show');
  document.body.classList.remove('navOpen');
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.textContent = '☰';
  navOverlay.setAttribute('aria-hidden', 'true');
}
function toggleNav(){
  nav.classList.contains('open') ? closeNav() : openNav();
}

menuBtn.addEventListener('click', toggleNav);
navOverlay.addEventListener('click', closeNav);

// Cerrar al hacer clic en un enlace del menú
nav.addEventListener('click', e => {
  if (e.target.closest('a')) closeNav();
});

// Cerrar con tecla Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && nav.classList.contains('open')) closeNav();
});

/* ---------- Eventos del estudio ---------- */
$('cameraBtn').addEventListener('click', activateCamera);

$('startBtn').addEventListener('click', async () => {
  if (!stream && !(await activateCamera())) return;
  live = true; elapsed = 0; started = Date.now();
  $('startBtn').disabled = true;
  $('stopBtn').disabled = false;
  $('status').textContent = '● EN SESIÓN';
  $('status').classList.add('active');
  $('liveBadge').textContent = '● EN SESIÓN';
  $('viewers').textContent = '12';
  tick = setInterval(refreshClock, 1000);
  refreshClock();
  log('sistema', 'Sesión local iniciada (no transmitida a Internet)');
  toast('Tu sesión de presentación comenzó');
});

$('stopBtn').addEventListener('click', finish);

$('micBtn').addEventListener('click', () => {
  if (!cameraStream) return toast('Activa primero la cámara');
  muted = !muted;
  cameraStream.getAudioTracks().forEach(t => t.enabled = !muted);
  updateDeviceLabels();
  log('click', muted ? 'Micrófono silenciado' : 'Micrófono habilitado');
});

$('camBtn').addEventListener('click', () => {
  if (!stream) return toast('Activa primero la cámara');
  camOff = !camOff;
  stream.getVideoTracks().forEach(t => t.enabled = !camOff);
  updateDeviceLabels();
  log('click', camOff ? 'Video apagado' : 'Video habilitado');
});

$('flipBtn').addEventListener('click', async () => {
  if (!cameraStream) return toast('Activa primero la cámara');
  cameraFacing = cameraFacing === 'user' ? 'environment' : 'user';
  await activateCamera();
  log('click', 'Cambio de cámara solicitado');
});

$('shareBtn').addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getDisplayMedia) return toast('Tu navegador no permite compartir pantalla');
  try {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      screenStream = null;
      $('video').srcObject = cameraStream;
      toast('Regresaste a la cámara');
      return;
    }
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    $('video').srcObject = screenStream;
    screenStream.getVideoTracks()[0].addEventListener('ended', () => {
      screenStream = null;
      $('video').srcObject = cameraStream;
    });
    log('click', 'Pantalla compartida en vista previa');
    toast('Pantalla visible en tu estudio');
  } catch {
    toast('No se compartió la pantalla');
  }
});

$('recordBtn').addEventListener('click', () => {
  const source = $('video').srcObject;
  if (!source) return toast('Activa cámara o comparte pantalla primero');
  if (recording) { stopRecording(); return; }
  if (!window.MediaRecorder) return toast('Este navegador no permite grabación');
  try {
    chunks = [];
    let tracks = [...source.getVideoTracks(), ...(cameraStream?.getAudioTracks() || [])];
    const combined = new MediaStream(tracks);
    const mime = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']
      .find(x => MediaRecorder.isTypeSupported(x));
    recorder = new MediaRecorder(combined, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      if (!chunks.length) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `viva-live-${Date.now()}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      log('sistema', 'Grabación descargada en formato WebM');
    };
    recorder.start(1000);
    recording = true;
    $('recordBtn').textContent = '⏹ Detener grabación';
    log('click', 'Grabación iniciada');
    toast('Grabando: pulsa de nuevo para guardar');
  } catch (e) {
    toast('No se pudo grabar: ' + e.message);
  }
});

$('liveContainer').addEventListener('dblclick', () => reaction(true));
$('likeBtn').addEventListener('click', () => reaction(false));

function reaction(double){
  likes++;
  $('likes').textContent = likes;
  const h = document.createElement('span');
  h.className = 'heart';
  h.textContent = '♥';
  $('hearts').append(h);
  setTimeout(() => h.remove(), 1600);
  log(double ? 'dblclick' : 'click',
      (double ? 'LIKE_STREAM (doble clic)' : 'LIKE_STREAM (botón)') + ' · reacción enviada');
}

$('products').addEventListener('click', e => {
  const b = e.target.closest('[data-prod]');
  if (!b) return;
  const p = products.find(x => x.id === Number(b.dataset.prod));
  if (!p) return;
  $('offerOverlay').textContent = `${p.name} · Bs ${p.price} (demostración)`;
  $('variantSelect').value = String(p.id);
  log('click', 'OFERTA_CLICK: Oferta destacada: ' + p.name);
  toast('Oferta visible sobre tu video');
});

$('variantSelect').addEventListener('change', e => {
  const p = products.find(x => x.id === Number(e.target.value));
  log('change', 'CAMBIO_VARIANTE: ' + (p?.name || ''));
});

$('orderForm').addEventListener('submit', e => {
  e.preventDefault();
  const p = products.find(x => x.id === Number($('variantSelect').value));
  const client = $('client').value.trim();
  const contact = $('contact').value.trim();
  const quantity = Number($('quantity').value);
  const error = $('orderError');
  error.textContent = '';

  if (!p || client.length < 3 || !/[a-záéíóúñ]/i.test(client)) {
    error.textContent = 'Escribe un nombre válido de al menos 3 caracteres.';
    log('submit', 'Pedido rechazado: nombre inválido');
    return;
  }
  if (!/^[0-9]{8}$/.test(contact)) {
    error.textContent = 'El teléfono debe tener exactamente 8 dígitos.';
    log('submit', 'Pedido rechazado: teléfono inválido');
    return;
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10 || quantity > (stock[p.id] ?? 0)) {
    error.textContent = 'Cantidad inválida o stock insuficiente.';
    log('submit', 'Pedido rechazado: stock/cantidad');
    return;
  }

  stock[p.id] -= quantity;
  orders.push({
    client, contact, quantity,
    product: p.name, price: p.price * quantity,
    time: new Date().toLocaleString('es-BO')
  });
  localStorage.setItem('vivaOrders', JSON.stringify(orders));
  renderProducts();
  renderOrders();
  log('submit', `COMPRA_EXITOSA: ${client} · ${quantity} × ${p.name} · Bs ${p.price * quantity}`);
  toast('Pedido de demostración registrado');
  $('orderForm').reset();
  $('quantity').value = '1';
});

$('chatInput').addEventListener('keyup', e => {
  if (Date.now() - typingLast > 450) {
    log('keyup', 'Escritura en el chat: ' + e.target.value.slice(0, 60));
    typingLast = Date.now();
  }
  $('typing').textContent = e.target.value
    ? `${e.target.value.length}/180 caracteres · Presiona Enter para enviar`
    : 'Escribe para probar el evento keyup.';
});

function message(name, body, fictional = false){
  const div = document.createElement('div');
  div.className = 'message';
  const b = document.createElement('b');
  b.textContent = name + (fictional ? ' · ficticio' : '') + ': ';
  div.append(b, document.createTextNode(body));
  $('chat').append(div);
  $('chat').scrollTop = $('chat').scrollHeight;
  comments++;
  $('commentCount').textContent = comments;
}

$('chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const value = $('chatInput').value.trim();
  const user = $('chatUser').value.trim();
  if (user.length < 3 || !/^[\w@.áéíóúñ-]+$/i.test(user)) {
    toast('Usuario inválido (mínimo 3 caracteres, sin espacios)');
    log('submit', 'Comentario rechazado: usuario inválido');
    return;
  }
  if (value.length < 2) {
    toast('El comentario necesita al menos 2 caracteres');
    log('submit', 'Comentario rechazado: texto vacío o muy corto');
    return;
  }
  message(user, value);
  $('chatInput').value = '';
  log('submit', `Comentario enviado por ${user}: ${value.slice(0, 65)}`);
  $('typing').textContent = 'Escribe para probar el evento keyup.';
});

const examples = [
  '¿Qué paquetes tienen hoy?',
  '¿Hay promociones para internet hogar?',
  '¡Saludos desde Bolivia!',
  '¿Cuánto cuesta el combo?'
];
$('fakeChat').addEventListener('click', () => {
  message('Espectador de prueba', examples[Math.floor(Math.random() * examples.length)], true);
  log('click', 'Comentario ficticio generado (simulación)');
});

$('addProduct').addEventListener('click', () => {
  const name = prompt('Nombre de la nueva oferta:');
  if (!name?.trim()) return;
  const raw = prompt('Precio en bolivianos (solo números):', '45');
  if (raw === null) return;
  const price = Number(raw);
  if (!Number.isFinite(price) || price < 0 || price > 100000) return toast('Precio inválido');
  const id = Math.max(...products.map(x => x.id)) + 1;
  products.push({ id, name: name.trim().slice(0, 55), desc: 'Oferta creada durante la sesión', price, icon: '✦' });
  stock[id] = 10;
  renderProducts();
  log('click', 'Oferta añadida dinámicamente: ' + name.trim());
  toast('Nueva oferta agregada');
});

$('logFilter').addEventListener('change', e => {
  log('change', 'Filtro de bitácora: ' + (e.target.value || 'Todos'));
  renderLogs();
});
$('clearLogs').addEventListener('click', () => { logs = []; renderLogs(); });
$('exportLogs').addEventListener('click', () => {
  const blob = new Blob(
    [logs.slice().reverse().map(l => `[${l.time}] ${l.type}: ${l.message}`).join('\n')],
    { type: 'text/plain;charset=utf-8' }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bitacora-viva-live.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

$('themeBtn').addEventListener('click', () => {
  const dark = document.body.classList.toggle('dark');
  localStorage.setItem('vivaTheme', dark ? 'dark' : 'light');
  $('themeBtn').textContent = dark ? '☾' : '☀';
});
if (localStorage.getItem('vivaTheme') === 'dark') { $('themeBtn').click(); }

window.addEventListener('beforeunload', () => { stopRecording(); endTracks(); });

renderProducts();
renderOrders();
log('sistema', 'Estudio cargado. Cámara pendiente de autorización.');