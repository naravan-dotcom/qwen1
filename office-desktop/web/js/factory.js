// Pabrik asset: geometri & tekstur untuk dunia kantor.
const THREE = window.__THREE__;

export const CELL = 4;         // ukuran satu sel meja (meter)
export const GRID = 4;         // 4x4 sel meja
export const WORLD = CELL * GRID;

const texCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

export function makeFloorTexture() {
  const c = texCanvas(512, 512), g = c.getContext('2d');
  g.fillStyle = '#232a36'; g.fillRect(0, 0, 512, 512);
  const tile = 64;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = (x + y) % 2 ? '#262e3b' : '#212937';
    g.fillRect(x * tile, y * tile, tile, tile);
    g.strokeStyle = 'rgba(255,255,255,0.03)';
    g.strokeRect(x * tile + .5, y * tile + .5, tile - 1, tile - 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  t.anisotropy = 8;
  return t;
}

export function makeCarpetTexture() {
  const c = texCanvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#2c3f55'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,.06)';
  for (let i = 0; i < 256; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); }
  for (let i = 0; i < 256; i += 16) { g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  return new THREE.CanvasTexture(c);
}

// layar monitor: kode / grafik / chat, sesuai kategori karyawan
export function makeScreenTexture(category, hue) {
  const W = 256, H = 160;
  const c = texCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#0d1117'; g.fillRect(0, 0, W, H);
  const rnd = mulberry(seedFrom(hue + category.length));
  const col = `hsl(${hue} 80% 62%)`;

  if (category === 'ide' || category === 'terminal') {
    g.fillStyle = '#161b22'; g.fillRect(0, 0, 46, H); // sidebar
    let y = 14;
    while (y < H - 8) {
      const indent = 8 + Math.floor(rnd() * 3) * 12;
      const colors = ['#ff7b72', '#79c0ff', '#d2a8ff', '#a5d6ff', '#7ee787'];
      g.fillStyle = colors[Math.floor(rnd() * colors.length)];
      const segs = 1 + Math.floor(rnd() * 3);
      let x = indent;
      for (let s = 0; s < segs; s++) {
        const w = 12 + rnd() * 40;
        g.globalAlpha = .35 + rnd() * .6;
        g.fillRect(x, y - 3, w, 4);
        x += w + 6;
      }
      g.globalAlpha = 1;
      y += 11;
    }
  } else if (category === 'documents') {
    g.fillStyle = '#f2f4f8'; g.fillRect(16, 10, W - 32, H - 20);
    g.fillStyle = '#333a46';
    for (let i = 0; i < 9; i++) g.fillRect(26, 24 + i * 14, 60 + rnd() * (W - 130), 3);
    g.fillStyle = col; g.fillRect(26, 16, 40, 6);
  } else if (category === 'communication') {
    for (let i = 0; i < 5; i++) {
      const left = rnd() > .5;
      g.fillStyle = left ? '#21262d' : col;
      g.globalAlpha = left ? 1 : .8;
      roundRect(g, left ? 12 : W - 12 - (70 + rnd() * 90), 12 + i * 28, 70 + rnd() * 90, 18, 9);
      g.fill();
    }
    g.globalAlpha = 1;
  } else if (category === 'design') {
    g.fillStyle = '#1a1f2b'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `hsla(${hue + i * 40} 70% 60% / .8)`;
      if (rnd() > .5) { g.beginPath(); g.arc(20 + rnd() * (W - 40), 20 + rnd() * (H - 40), 8 + rnd() * 22, 0, 7); g.fill(); }
      else g.fillRect(rnd() * (W - 40), rnd() * (H - 40), 14 + rnd() * 40, 14 + rnd() * 40);
    }
  } else if (category === 'game') {
    g.fillStyle = '#101820'; g.fillRect(0, 0, W, H);
    g.fillStyle = col; g.fillRect(0, H - 26, W, 26);
    g.fillStyle = '#ffd166';
    for (let i = 0; i < 12; i++) g.fillRect(rnd() * W, rnd() * (H - 40), 4, 4);
  } else { // browser & lainnya: "webpage"
    g.fillStyle = '#1b212c'; g.fillRect(0, 0, W, 18);
    for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(8 + i * 34, 5, 26, 8); }
    g.fillStyle = '#f5f7fa'; g.fillRect(10, 26, W - 20, H - 36);
    g.fillStyle = col; g.fillRect(18, 34, 90, 10);
    g.fillStyle = '#c3cad6';
    for (let i = 0; i < 6; i++) g.fillRect(18, 54 + i * 14, 40 + rnd() * (W - 90), 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

// papan nama kecil di atas kepala
export function makeNameSprite(text, colorHex = '#e6e9ef', bgAlpha = .55) {
  const pad = 8, fs = 30;
  const meas = (() => { const g = texCanvas(10, 10).getContext('2d'); g.font = `600 ${fs}px "Segoe UI",sans-serif`; return g.measureText(text).width; })();
  const W = Math.ceil(meas) + pad * 2, H = fs + pad * 2;
  const c = texCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = `rgba(10,13,20,${bgAlpha})`;
  roundRectPath(g, 0, 0, W, H, 10); g.fill();
  g.font = `600 ${fs}px "Segoe UI",sans-serif`;
  g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillStyle = colorHex;
  g.fillText(text, W / 2, H / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  const scale = 0.0075;
  sp.scale.set(W * scale, H * scale, 1);
  return sp;
}

// emoji melayang (🔥 💻 ☕ 😵 ...)
export function makeEmojiSprite(ch, sizePx = 64) {
  const c = texCanvas(sizePx, sizePx), g = c.getContext('2d');
  g.font = `${sizePx * 0.82}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, sizePx / 2, sizePx / 2 + sizePx * 0.06);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(.6, .6, 1);
  return sp;
}

// bayangan bulat lembut di bawah karakter (fallback tanpa shadow map)
let _blobTex = null;
export function blobShadowMaterial() {
  if (!_blobTex) {
    const c = texCanvas(128, 128), g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,.42)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    _blobTex = new THREE.CanvasTexture(c);
  }
  return new THREE.MeshBasicMaterial({ map: _blobTex, transparent: true, depthWrite: false });
}

export function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export const seedFrom = (n) => Math.floor(Math.abs(n) * 7919 + 13) >>> 0;

function roundRect(g, x, y, w, h, r) { g.beginPath(); roundRectPath(g, x, y, w, h, r); }
function roundRectPath(g, x, y, w, h, r) {
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
