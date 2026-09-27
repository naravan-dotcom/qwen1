// Membangun "kantor": lantai, dinding, jendela view kota, cluster meja, pantry, ruang rapat.
const THREE = window.__THREE__;
import { CELL, GRID, WORLD, makeFloorTexture, makeCarpetTexture, makeNameSprite, mulberry, seedFrom } from './factory.js';

const HALF = WORLD / 2;

export function buildOffice(scene) {
  const office = new THREE.Group();
  scene.add(office);

  // ---------------- lantai & plafon ----------------
  const floorMat = new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: .9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD + 14, WORLD + 14), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  office.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(WORLD + 14, WORLD + 14),
    new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 5.6;
  office.add(ceil);

  // panel lampu plafon (emissive) di atas tiap lajur meja
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < 2; j++) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(CELL * 3.4, .08, .5),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdfe9ff, emissiveIntensity: 1.4 }));
      lamp.position.set(-HALF + CELL * 2, 5.5, -HALF + CELL * (i + .25 + j * .5));
      office.add(lamp);
    }
  }

  // ---------------- dinding ----------------
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2d3646, roughness: .95, side: THREE.DoubleSide });
  const mkWall = (w, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 5.6), wallMat);
    m.position.set(x, 2.8, z); m.rotation.y = ry; m.receiveShadow = true;
    office.add(m); return m;
  };
  const S = HALF + 7;
  mkWall(S * 2, 0, -S, 0);
  mkWall(S * 2, 0, S, Math.PI);
  mkWall(S * 2, -S, 0, Math.PI / 2);

  // dinding depan = jendela lebar melihat kota
  const winMat = new THREE.MeshStandardMaterial({ color: 0x0a1220, roughness: 1, metalness: 0 });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(S * 2, 5.6), winMat);
  win.position.set(0, 2.8, S - .01); win.rotation.y = Math.PI;
  office.add(win);
  // kusen jendela
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x11161f, roughness: .8 });
  for (let i = -4; i <= 4; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.12, 5.6, .12), frameMat);
    post.position.set(i * (S / 4.5), 2.8, S - .06);
    office.add(post);
  }

  // ---------------- gedung kota di luar jendela ----------------
  const city = new THREE.Group();
  office.add(city);
  const rnd = mulberry(seedFrom(42));
  const cityMat = new THREE.MeshBasicMaterial({ color: 0x0c1322, fog: false });
  const winGlow = new THREE.MeshBasicMaterial({ color: 0xffd166, fog: false });
  for (let i = 0; i < 46; i++) {
    const w = 2 + rnd() * 5, h = 4 + rnd() * 26, d = 2 + rnd() * 5;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat);
    const x = (rnd() - .5) * 120;
    const z = S + 10 + rnd() * 70;
    b.position.set(x, h / 2 - 1, z);
    city.add(b);
    // beberapa jendela menyala
    const n = 2 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(.5, .35), winGlow);
      g.position.set(x + (rnd() - .5) * (w - .8), rnd() * (h - 2) - 1 + h / 2 * 0 + (rnd() * h * .5), z - d / 2 - .02);
      g.position.y = rnd() * (h - 2) + (h / 2 - 1) - (h / 2 - 1) + rnd() * h * .5;
      city.add(g);
    }
  }
  // bintang
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 260; i++) sp.push((rnd() - .5) * 260, 20 + rnd() * 90, S + 20 + rnd() * 160);
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  city.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x8fa3c8, size: .35, sizeAttenuation: true, fog: false })));

  // ---------------- karpet tengah ----------------
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(WORLD + 2, WORLD + 2),
    new THREE.MeshStandardMaterial({ map: makeCarpetTexture(), roughness: 1 }));
  carpet.rotation.x = -Math.PI / 2; carpet.position.y = .01;
  office.add(carpet);

  // ---------------- cluster meja kerja ----------------
  const deskGroup = new THREE.Group();
  office.add(deskGroup);
  const desks = [];
  const topMat = new THREE.MeshStandardMaterial({ color: 0x8a6f52, roughness: .7 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2b3140, roughness: .6, metalness: .4 });
  const chairSeatMat = new THREE.MeshStandardMaterial({ color: 0x39415a, roughness: .9 });
  const dividerMat = new THREE.MeshStandardMaterial({ color: 0x39445a, roughness: .95, transparent: true, opacity: .96 });

  for (let dx = 0; dx < GRID; dx++) {
    for (let dz = 0; dz < GRID; dz++) {
      const cx = -HALF + CELL * (dx + .5);
      const cz = -HALF + CELL * (dz + .5);
      const unit = new THREE.Group();
      unit.position.set(cx, 0, cz);
      deskGroup.add(unit);
      desks.push({ key: `${dx},${dz}`, cx, cz, unit });

      // dua meja panjang menghadap saling membelakangi (pod 4 kursi)
      for (const off of [-1.15, 1.15]) {
        const top = new THREE.Mesh(new THREE.BoxGeometry(3.4, .08, 1.3), topMat);
        top.position.set(0, .74, off); top.castShadow = true; top.receiveShadow = true;
        unit.add(top);
        for (const lx of [-1.5, 1.5]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(.08, .72, 1.0), legMat);
          leg.position.set(lx, .36, off);
          unit.add(leg);
        }
      }
      // partisi tengah antar dua baris meja
      const div = new THREE.Mesh(new THREE.BoxGeometry(3.4, .55, .06), dividerMat);
      div.position.set(0, 1.05, 0);
      unit.add(div);
      // partisi ujung agar terasa cubicle
      for (const ex of [-1.7, 1.7]) {
        const end = new THREE.Mesh(new THREE.BoxGeometry(.06, .55, 3.0), dividerMat);
        end.position.set(ex, 1.05, 0);
        unit.add(end);
      }
      // rak kecil / printer sesekali
      if ((dx + dz) % 3 === 0) {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(.7, .5, .5),
          new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: .8 }));
        shelf.position.set(1.35, 1.03, -1.6);
        unit.add(shelf);
      }
    }
  }

  // ---------------- pantry (kanan) & ruang rapat (belakang kiri) ----------------
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e5843, roughness: .8 });
  const counterMat = new THREE.MeshStandardMaterial({ color: 0x9aa7b8, roughness: .4, metalness: .3 });

  const pantry = new THREE.Group();
  pantry.position.set(HALF + 3.4, 0, -2);
  office.add(pantry);
  const ptop = new THREE.Mesh(new THREE.BoxGeometry(4.6, .1, 2.2), counterMat);
  ptop.position.y = .95; ptop.castShadow = true; pantry.add(ptop);
  const pbase = new THREE.Mesh(new THREE.BoxGeometry(4.6, .9, 2.2), woodMat);
  pbase.position.y = .47; pantry.add(pbase);
  // mesin kopi
  const coffee = new THREE.Group(); coffee.position.set(-1.4, 1.0, 0); pantry.add(coffee);
  const cbody = new THREE.Mesh(new THREE.BoxGeometry(.55, .7, .45),
    new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: .5, metalness: .5 }));
  cbody.position.y = .35; coffee.add(cbody);
  const cred = new THREE.Mesh(new THREE.BoxGeometry(.4, .06, .06),
    new THREE.MeshStandardMaterial({ color: 0xef476f, emissive: 0xef476f, emissiveIntensity: 1.5 }));
  cred.position.set(0, .62, .24); coffee.add(cred);
  pantry.userData.sign = '☕ PANTRY';
  // meja makan kecil + kursi bulat
  const table = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, .08, 20), woodMat);
  table.position.set(1.2, .78, 3.4); office.add(table);
  const tleg = new THREE.Mesh(new THREE.CylinderGeometry(.08, .12, .78, 10), legMat);
  tleg.position.set(1.2, .39, 3.4); office.add(tleg);

  const meeting = new THREE.Group();
  meeting.position.set(-HALF - 3.6, 0, 3);
  office.add(meeting);
  const mtable = new THREE.Mesh(new THREE.BoxGeometry(3.4, .1, 1.6), woodMat);
  mtable.position.y = .74; mtable.castShadow = true; meeting.add(mtable);
  for (const mx of [-1.4, 1.4]) for (const mz of [-.55, .55]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(.08, .72, .08), legMat);
    l.position.set(mx, .36, mz); meeting.add(l);
  }
  // papan tulis
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.4),
    new THREE.MeshStandardMaterial({ color: 0xf3f6fb, roughness: .6 }));
  board.position.set(0, 2.2, -1.15); board.rotation.y = Math.PI / 2; meeting.add(board);
  const bframe = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.6, 2.8), frameMat);
  bframe.position.set(-.04, 2.2, -1.15); meeting.add(bframe);
  meeting.userData.sign = '📊 MEETING';

  // tanaman hias di sudut-sudut
  const potMat = new THREE.MeshStandardMaterial({ color: 0x7a4a32, roughness: .9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7d4f, roughness: .9 });
  for (const [px, pz] of [[-HALF - 4, -HALF - 3], [HALF + 4, HALF + 4], [-HALF - 4, HALF + 4], [HALF + 5, -HALF - 4]]) {
    const pot = new THREE.Group(); pot.position.set(px, 0, pz); office.add(pot);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.32, .24, .5, 12), potMat);
    base.position.y = .25; pot.add(base);
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(.28, 1.1 + (i % 2) * .4, 8), leafMat);
      leaf.position.set(Math.cos(i * 1.9) * .12, .95 + (i % 2) * .2, Math.sin(i * 1.9) * .12);
      leaf.rotation.z = (i - 1.5) * .12;
      pot.add(leaf);
    }
  }

  // tanda pantry/meeting sederhana (teks digambar via canvas sprite besar)
  const s1 = makeNameSprite('☕ Pantry — tempat kabur dari deadline', '#ffd166', .7);
  s1.scale.multiplyScalar(2.4); s1.position.set(HALF + 3.4, 2.6, -2); office.add(s1);
  const s2 = makeNameSprite('📊 Ruang Rapat — meeting yang bisa jadi email', '#4cc9f0', .7);
  s2.scale.multiplyScalar(2.4); s2.position.set(-HALF - 3.6, 2.6, 3); office.add(s2);

  return { office, desks };
}

// posisi kursi utk koordinat meja/seat dari backend
export function seatToWorld(seat) {
  return new THREE.Vector3(seat[0], 0, seat[1]);
}
export function deskCenter(desk) {
  return new THREE.Vector3(-HALF + CELL * (desk[0] + .5), 0, -HALF + CELL * (desk[1] + .5));
}
export { HALF };
