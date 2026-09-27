// Loader: muat three.js dari CDN (dengan fallback mirror) lalu baru jalankan app.
const MIRRORS = [
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  'https://unpkg.com/three@0.160.0/build/three.module.js',
  'https://esm.sh/three@0.160.0',
];
(async () => {
  let THREE = null;
  for (const url of MIRRORS) {
    try { THREE = await import(url); break; } catch (e) { console.warn('mirror gagal:', url, e); }
  }
  if (!THREE) { showConnError(); return; }
  window.__THREE__ = THREE;
  const { OrbitControls } = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js')
    .catch(() => import('https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js'));
  window.__ORBIT__ = OrbitControls;
  startApp(THREE, OrbitControls);
})();

function showConnError() {
  const el = document.getElementById('conn');
  el.classList.remove('hide');
  el.innerHTML = '<div>❌ Gagal memuat library Three.js.<br/>Perlu koneksi internet pertama kali untuk mengunduhnya dari CDN.</div>';
}

function startApp(THREE, OrbitControls) {

const $ = (id) => document.getElementById(id);
const world = new World($('app'));

// ---------------- WebSocket + auto reconnect ----------------
let ws, lastSnap = null;
const connEl = $('conn');

function connect() {
  try { ws = new WebSocket('ws://localhost:8765/ws'); }
  catch (e) { setTimeout(connect, 1500); return; }
  ws.onopen = () => { connEl.classList.add('hide'); };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'state') { lastSnap = msg; world.applyState(msg); updateHud(msg); renderRoster(msg); }
  };
  ws.onclose = () => {
    connEl.classList.remove('hide');
    setTimeout(connect, 1500);
  };
  ws.onerror = () => { try { ws.close(); } catch (e) {} };
}
connect();

// ---------------- HUD ----------------
const MOODS = [
  [0.00, '😴', 'Kantor sepi… karyawan pada lembur di rumah masing-masing.'],
  [0.15, '🙂', 'Suasana tenang, kerja santai tapi jalan.'],
  [0.35, '💼', 'Mulai ramai, semua jari sibuk mengetik.'],
  [0.55, '🏃', 'Padah! Karyawan hilir mudik bawa dokumen.'],
  [0.75, '🔥', 'GILA! Semua divisi kejar deadline bareng.'],
  [0.90, '🚨', 'KRITIS! Kantor kebakaran metaforis (dan literal).'],
];

function updateHud(s) {
  $('vWorkers').textContent = s.totalWorkers;
  $('vBusy').textContent = s.busyWorkers;
  $('vCpu').textContent = s.cpuLoad.toFixed(0) + '%';
  $('vMem').textContent = s.memPercent.toFixed(0) + '%';
  $('cpuBar').firstElementChild.style.width = Math.min(100, s.cpuLoad) + '%';
  $('memBar').firstElementChild.style.width = Math.min(100, s.memPercent) + '%';
  const load = world.load01;
  let m = MOODS[0];
  for (const x of MOODS) if (load >= x[0]) m = x;
  $('moodEmoji').textContent = m[1];
  $('moodText').textContent = m[2];
}

function colorOf(w) { return `hsl(${w.hue} 65% 60%)`; }

function renderRoster(s) {
  const el = $('roster');
  const sorted = [...s.workers].sort((a, b) => b.busyness - a.busyness);
  el.innerHTML = '';
  for (const w of sorted.slice(0, 40)) {
    const row = document.createElement('div');
    row.className = 'emp' + (w.pid === selectedPid ? ' sel' : '');
    row.innerHTML = `<span class="dot" style="background:${colorOf(w)}"></span>
      <span><div class="nm">${esc(w.nickname)} — ${esc(w.name)}</div>
      <div class="rl">${esc(w.role)} · ${w.cpu}% CPU · ${w.memMb|0} MB${w.seat ? '' : ' · 🏝️ pantry'}</div></span>
      <span class="bz">${'▮'.repeat(Math.round(w.busyness * 5)) || '·'}</span>`;
    row.onclick = () => selectWorker(w.pid);
    el.appendChild(row);
  }
}

const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------- detail panel & seleksi ----------------
let selectedPid = null;
function selectWorker(pid) {
  selectedPid = pid;
  world.focusOn(pid);
  if (lastSnap) renderRoster(lastSnap);
}
setInterval(() => {
  const el = $('detail');
  if (selectedPid == null || !lastSnap) { el.classList.remove('show'); return; }
  const w = lastSnap.workers.find(x => x.pid === selectedPid);
  if (!w) { el.innerHTML = `<div class="name">👋 ${esc(lastSnap._goneName || 'Karyawan')}</div>sudah resign (proses ditutup).`; 
            el.classList.add('show'); return; }
  el.innerHTML = `
    <div class="name">${esc(w.nickname)} <span class="tag">${esc(w.category)}</span>
      <span class="tag">${esc(w.role)}</span></div>
    Aplikasi: <b>${esc(w.displayName)}</b> (PID ${w.pid})<br/>
    Kesibukan: <b>${Math.round(w.busyness * 100)}%</b> · CPU ${w.cpu}% · RAM ${w.memMb} MB · ${w.threads} thread<br/>
    Status: ${w.state_label || (w.seat ? '🪶 duduk bekerja di meja' : '🏝️ nongkrong di pantry (kebagian kursi penuh)')}`;
  el.classList.add('show');
}, 500);

// ---------------- toast join/leave/meeting ----------------
let toastTimer;
function toast(text, cls = '') {
  const t = $('toast');
  t.textContent = text;
  t.className = 'hud panel show ' + cls;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
setHooks({
  onJoin: (w) => toast(`📥 ${w.nickname} (${w.name}) baru diterima bekerja!`, 'new'),
  onLeave: (w) => {
    if (selectedPid === w.pid && $('detail')) $('detail').innerHTML = '';
    toast(`📤 ${w.nickname} (${w.name}) resign / process closed.`, 'gone');
  },
  onMeeting: (n) => toast(`📊 ${n} karyawan dipanggil meeting mendadak… (bisa jadi email kok sebenarnya)`),
});

// ---------------- klik karakter di 3D ----------------
const rayMouse = new THREE.Vector2();
let downXY = null;
world.renderer.domElement.addEventListener('pointerdown', e => downXY = [e.clientX, e.clientY]);
world.renderer.domElement.addEventListener('pointerup', e => {
  if (!downXY) return;
  const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
  downXY = null;
  if (moved > 6) return; // itu drag orbit, bukan klik
  rayMouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const pid = world.pickWorker(rayMouse.x, rayMouse.y);
  if (pid != null) selectWorker(pid); else { selectedPid = null; $('detail').classList.remove('show'); if (lastSnap) renderRoster(lastSnap); }
});

// ---------------- keyboard kamera ----------------
addEventListener('keydown', e => {
  if (e.key >= '1' && e.key <= '4') world.setCameraPreset(e.key);
  if (e.key.toLowerCase() === 'r') world.setCameraPreset('default');
});
}
