// Dunia 3D: renderer, kamera, pencahayaan dinamis (langit sesuai beban CPU),
// sistem partikel asap/kipas, dan sinkronisasi data WS -> karakter.
const THREE = window.__THREE__;
const OrbitControls = window.__ORBIT__;
import { CELL, GRID, WORLD, makeEmojiSprite, mulberry, seedFrom } from './factory.js';
import { buildOffice, HALF } from './office.js';
import { Worker } from './worker.js';

const CENTER = new THREE.Vector3(0, 1, 0);
const CAM_PRESETS = {
  default: [24, 18, 26],
  1: [24, 18, 26],
  2: [-24, 14, 26],
  3: [0, 30, -24],
  4: [0, 45, 0.01],
};

export class World {
  constructor(container) {
    this.container = container;
    this.workers = new Map();      // pid -> Worker
    this.state = null;             // snapshot terakhir dari server
    this.load01 = 0;               // beban CPU ternormalisasi (smoothed)
    this.rnd = mulberry(seedFrom(7));
    this.meetingCooldown = 0;

    // ---------- renderer & scene ----------
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e16);
    this.scene.fog = new THREE.Fog(0x0a0e16, 60, 160);

    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .1, 500);
    this.camTargetPos = new THREE.Vector3(...CAM_PRESETS.default);
    this.camera.position.copy(CAM_PRESETS.default.map(v => v + (Math.random() - .5)));
    this.camera.position.set(...CAM_PRESETS.default);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(CENTER);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .07;
    this.controls.maxPolarAngle = Math.PI / 2.05;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 90;

    // ---------- lights ----------
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x30281e, .8);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe9c4, 1.1);
    this.sun.position.set(30, 40, 50);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.ceiling = new THREE.PointLight(0xdfe9ff, .6, 60, 1.6);
    this.ceiling.position.set(0, 5, 0);
    this.scene.add(this.ceiling);

    // matahari "di balik jendela" — warna berubah saat laptop panas/sibuk
    this.skyGlow = new THREE.Mesh(new THREE.PlaneGeometry(160, 70),
      new THREE.MeshBasicMaterial({ color: 0x16233f, fog: false, depthWrite: false }));
    this.skyGlow.position.set(0, 22, HALF + 95);
    this.skyGlow.rotation.y = Math.PI;
    this.scene.add(this.skyGlow);

    // ---------- kantor & meja ----------
    const { office, desks } = buildOffice(this.scene);
    this.deskUnits = desks;
    this.deskByKey = new Map(desks.map(d => [d.key, d]));

    // kursi: simpan lookup utk koordinat seat backend (sx, sz dunia lokal grid)
    // backend mengirim seat dalam koordinat yang sama dengan posisi dunia: sx,sz global meter
    // (lihat monitor.py: sx = dx*4 + ... - 1 ; kita petakan ke dunia: x = sx - HALF + CELL/2? )
    // Lebih sederhana: backend mengirim indeks relatif; kami konversi di seatWorldPos().

    // pantry spots & meeting spots
    this.pantryArea = new THREE.Vector3(HALF + 3.4, 0, -2);
    this.meetingArea = new THREE.Vector3(-HALF - 3.6, 0, 3);

    // ---------- partikel asap (beban tinggi) ----------
    this.smokeCount = 120;
    const sg = new THREE.BufferGeometry();
    this.smokePos = new Float32Array(this.smokeCount * 3);
    this.smokeVel = [];
    for (let i = 0; i < this.smokeCount; i++) {
      this.resetSmoke(i, true);
    }
    sg.setAttribute('position', new THREE.BufferAttribute(this.smokePos, 3));
    const smokeCv = document.createElement('canvas'); smokeCv.width = smokeCv.height = 64;
    const sctx = smokeCv.getContext('2d');
    const gr = sctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(180,190,210,.5)'); gr.addColorStop(1, 'rgba(180,190,210,0)');
    sctx.fillStyle = gr; sctx.fillRect(0, 0, 64, 64);
    this.smoke = new THREE.Points(sg, new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(smokeCv), transparent: true, size: 1.6,
      depthWrite: false, opacity: 0, color: 0xaab4c4,
    }));
    this.scene.add(this.smoke);

    // kipas plafon
    this.fans = [];
    for (const [fx, fz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      const fan = new THREE.Group();
      const hub = new THREE.Mesh(new THREE.SphereGeometry(.14, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x22262e }));
      fan.add(hub);
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(.9, .02, .16),
          new THREE.MeshStandardMaterial({ color: 0x39445a, roughness: .7 }));
        blade.position.x = .5;
        const holder = new THREE.Group();
        holder.rotation.y = b * (Math.PI * 2 / 3);
        holder.add(blade);
        fan.add(holder);
      }
      fan.position.set(fx, 5.2, fz);
      this.scene.add(fan);
      this.fans.push(fan);
    }

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    this.clock = new THREE.Clock();
    this._raf = this._raf.bind(this);
    requestAnimationFrame(this._raf);
  }

  // ---------- pemetaan koordinat backend -> dunia ----------
  // backend mengirim posisi kursi dalam METER koordinat dunia (lihat monitor.py ALL_SEATS).
  seatWorldPos(seat) {
    return new THREE.Vector3(seat[0], 0, seat[1]);
  }
  seatFacing(seat) {
    // hadapkan karyawan ke pusat sel meja terdekat (meja selalu di tengah sel)
    const cellX = Math.round((seat[0] + HALF - CELL / 2) / CELL) * CELL - HALF + CELL / 2;
    const cellZ = Math.round((seat[1] + HALF - CELL / 2) / CELL) * CELL - HALF + CELL / 2;
    return Math.atan2(cellX - seat[0], cellZ - seat[1]);
  }

  pantrySpot() {
    const a = this.pantryArea;
    return new THREE.Vector3(a.x + (this.rnd() - .5) * 3.4, 0, a.z + (this.rnd() - .5) * 4.6);
  }
  meetingSpot() {
    const a = this.meetingArea;
    return new THREE.Vector3(a.x + (this.rnd() - .5) * 2.4, 0, a.z + (this.rnd() - .5) * 3.4);
  }

  resetSmoke(i, spread = false) {
    const w = this.workers.size ? [...this.workers.values()] : [];
    let src;
    if (w.length && this.rnd() > .3) {
      const wk = w[Math.floor(this.rnd() * w.length)];
      src = wk.group.position;
    } else {
      src = { x: (this.rnd() - .5) * WORLD, z: (this.rnd() - .5) * WORLD };
    }
    this.smokePos[i * 3] = src.x + (this.rnd() - .5) * .8;
    this.smokePos[i * 3 + 1] = spread ? this.rnd() * 5.5 : 1.4;
    this.smokePos[i * 3 + 2] = src.z + (this.rnd() - .5) * .8;
    this.smokeVel[i] = .4 + this.rnd() * .9;
  }

  // ---------- data dari server ----------
  applyState(snap) {
    this.state = snap;
    const seen = new Set();
    for (const w of snap.workers) {
      seen.add(w.pid);
      let worker = this.workers.get(w.pid);
      if (!worker) {
        worker = new Worker(w, this);
        this.workers.set(w.pid, worker);
        onJoin && onJoin(w);
      } else {
        worker.updateData(w);
      }
    }
    for (const [pid, worker] of this.workers) {
      if (!seen.has(pid) && !worker.dead) {
        worker.fadeOut();
        onLeave && onLeave(worker.data);
      }
      if (worker.dead && worker.fade <= 0) this.workers.delete(pid);
    }

    // event meeting sesekali saat ramai
    this.meetingCooldown -= 1;
    if (snap.busyWorkers >= 5 && this.meetingCooldown <= 0 && this.rnd() < .25) {
      this.meetingCooldown = 12;
      const seated = [...this.workers.values()].filter(x => !x.dead && x.state === 'work');
      const n = Math.min(3, seated.length);
      for (let i = 0; i < n; i++) {
        const wk = seated[Math.floor(this.rnd() * seated.length)];
        if (wk) wk.goToMeeting(this.meetingSpot());
      }
      onMeeting && onMeeting(n);
    }
  }

  // ---------- render loop ----------
  _raf() {
    requestAnimationFrame(this._raf);
    const dt = Math.min(.1, this.clock.getDelta());
    const now = performance.now();

    // beban ternormalisasi dari data server (CPU laptop + jumlah karyawan sibuk)
    let targetLoad = 0;
    if (this.state) {
      const byCpu = Math.min(1, this.state.cpuLoad / 90);
      const byBusy = Math.min(1, this.state.busyWorkers / 12);
      targetLoad = Math.max(byCpu, (byCpu + byBusy) / 2);
    }
    this.load01 += (targetLoad - this.load01) * Math.min(1, dt * .8);
    const L = this.load01;

    // langit & pencahayaan berubah: tenang -> sore -> merah "panas"
    const sky = new THREE.Color().setHSL(.62 - L * .58, .45 + L * .3, .12 + L * .10);
    this.skyGlow.material.color.copy(sky);
    this.scene.background.setHSL(.62 - L * .55, .35, .05 + L * .02);
    this.scene.fog.color.copy(this.scene.background);
    this.sun.color.setHSL(.10 - L * .07, .75, .62);
    this.sun.intensity = 1.1 - L * .45;
    this.hemi.intensity = .8 - L * .25;
    this.ceiling.intensity = .6 + L * 1.1;

    // kipas plafon berputar lebih cepat saat laptop sibuk
    for (let i = 0; i < this.fans.length; i++) {
      this.fans[i].rotation.y += dt * (1.2 + L * 22 + i * .3);
    }

    // asap tipis mengepul saat beban tinggi
    const smokeOpacity = Math.max(0, (L - .55) / .45) * .5;
    this.smoke.material.opacity = smokeOpacity;
    if (smokeOpacity > .01) {
      for (let i = 0; i < this.smokeCount; i++) {
        this.smokePos[i * 3 + 1] += this.smokeVel[i] * dt * (1 + L);
        this.smokePos[i * 3] += Math.sin(now * .001 + i) * dt * .12;
        if (this.smokePos[i * 3 + 1] > 5.4) this.resetSmoke(i);
      }
      this.smoke.geometry.attributes.position.needsUpdate = true;
    }

    // update semua karakter
    for (const w of this.workers.values()) w.update(dt, now, L);

    // kamera preset (digerakkan halus oleh main.js lewat setCameraPreset)
    if (this.camAnim) {
      this.camera.position.lerp(this.camTargetPos, Math.min(1, dt * 2.2));
      if (this.camera.position.distanceTo(this.camTargetPos) < .3) this.camAnim = false;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  setCameraPreset(key) {
    const p = CAM_PRESETS[key] || CAM_PRESETS.default;
    this.camTargetPos.set(p[0], p[1], p[2]);
    this.camAnim = true;
  }

  pickWorker(ndcX, ndcY) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    let best = null, bestD = 1e9;
    for (const w of this.workers.values()) {
      if (w.dead) continue;
      const hits = ray.intersectObject(w.group, true);
      if (hits.length && hits[0].distance < bestD) { bestD = hits[0].distance; best = w; }
    }
    return best ? best.data.pid : null;
  }

  focusOn(pid) {
    const w = this.workers.get(pid);
    if (!w) return;
    const p = w.group.position;
    this.controls.target.lerp(new THREE.Vector3(p.x, 1, p.z), .8);
  }
}

// hooks UI (di-set oleh main.js)
let onJoin, onLeave, onMeeting;
export function setHooks(h) { ({ onJoin, onLeave, onMeeting } = h); }
