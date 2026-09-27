// Karakter "karyawan": robot mungil yang duduk bekerja / jalan ke pantry / meeting.
const THREE = window.__THREE__;
import { makeScreenTexture, makeNameSprite, makeEmojiSprite, blobShadowMaterial, mulberry, seedFrom } from './factory.js';

const BODY = new THREE.CylinderGeometry(.17, .26, .52, 14);
const HEAD = new THREE.SphereGeometry(.21, 18, 14);
const ARM = new THREE.CapsuleGeometry(.055, .3, 4, 8);
const LEG = new THREE.CapsuleGeometry(.06, .26, 4, 8);
const ANTENNA = new THREE.CylinderGeometry(.012, .02, .18, 6);
const ANT_BALL = new THREE.SphereGeometry(.045, 8, 8);
const MONITOR = new THREE.BoxGeometry(.62, .40, .04);
const MON_STAND = new THREE.CylinderGeometry(.03, .09, .18, 8);
const KEYB = new THREE.BoxGeometry(.42, .03, .16);
const CUP = new THREE.CylinderGeometry(.05, .04, .09, 10);

export class Worker {
  /** @param {{pid:number,name:string,displayName:string,nickname:string,category:string,role:string,busyness:number,hue:number,desk:?number[],seat:?number[]}} data */
  constructor(data, world) {
    this.data = data;
    this.world = world; // referensi ke World utk posisi meja/kursi
    this.pid = data.pid;
    const rnd = mulberry(seedFrom(data.pid + data.hue));
    this.rnd = rnd;
    this.speed = 2.2 + rnd() * .8;

    const skin = new THREE.Color(`hsl(${data.hue} 55% 55%)`);
    const dark = new THREE.Color(`hsl(${data.hue} 45% 38%)`);
    const bodyMat = new THREE.MeshStandardMaterial({ color: skin, roughness: .55, metalness: .25 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xdfe6f0, roughness: .4, metalness: .35 });

    this.group = new THREE.Group();

    // torso
    this.torso = new THREE.Mesh(BODY, bodyMat);
    this.torso.position.y = .62; this.torso.castShadow = true;
    this.group.add(this.torso);

    // kepala + visor
    this.head = new THREE.Mesh(HEAD, headMat);
    this.head.position.y = 1.08; this.head.castShadow = true;
    this.group.add(this.head);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(.145, 12, 10, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x10151d, emissive: 0x2b6cb0, emissiveIntensity: .55, roughness: .2 }));
    visor.rotation.y = -Math.PI / 2; // hadap -z? kita buat hadap +z depan karakter (depan = +z group)
    visor.rotation.y = Math.PI / 2;
    visor.position.set(0, 1.1, .09);
    this.group.add(visor);

    // antena
    const ant = new THREE.Mesh(ANTENNA, new THREE.MeshStandardMaterial({ color: dark }));
    ant.position.y = 1.34; this.group.add(ant);
    this.antBall = new THREE.Mesh(ANT_BALL,
      new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffa000, emissiveIntensity: 1.2 }));
    this.antBall.position.y = 1.44; this.group.add(this.antBall);

    // lengan & kaki (pivot di bahu/panggul supaya bisa diayun)
    this.arms = []; this.legs = [];
    for (const side of [-1, 1]) {
      const armPivot = new THREE.Group();
      armPivot.position.set(side * .24, .86, 0);
      const arm = new THREE.Mesh(ARM, bodyMat);
      arm.position.y = -.17; arm.castShadow = true;
      armPivot.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 8), headMat);
      hand.position.y = -.36; armPivot.add(hand);
      this.group.add(armPivot); this.arms.push(armPivot);

      const legPivot = new THREE.Group();
      legPivot.position.set(side * .1, .34, 0);
      const leg = new THREE.Mesh(LEG, new THREE.MeshStandardMaterial({ color: 0x2b3140, roughness: .8 }));
      leg.position.y = -.16; leg.castShadow = true;
      legPivot.add(leg);
      this.group.add(legPivot); this.legs.push(legPivot);
    }

    // bayangan lembut
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(.9, .9), blobShadowMaterial());
    this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = .02;
    this.group.add(this.blob);

    // papan nama
    this.nameSprite = makeNameSprite(`${data.nickname}`, '#eef2f8', .5);
    this.nameSprite.position.y = 1.78;
    this.group.add(this.nameSprite);

    // properti workstation (monitor, keyboard, kursi, gelas) — dibuat sekali, dipindah-pindah
    this.props = new THREE.Group();
    this.monitor = new THREE.Mesh(MONITOR, new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: .5 }));
    this.screenMat = new THREE.MeshBasicMaterial({ map: makeScreenTexture(data.category, data.hue), toneMapped: false });
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(.56, .34), this.screenMat);
    this.screen.position.z = .024;
    this.monitor.add(this.screen);
    this.monStand = new THREE.Mesh(MON_STAND, new THREE.MeshStandardMaterial({ color: 0x22262e }));
    this.keyboard = new THREE.Mesh(KEYB, new THREE.MeshStandardMaterial({ color: 0x1c2129, roughness: .8 }));
    this.cupMesh = new THREE.Mesh(CUP, new THREE.MeshStandardMaterial({ color: 0xf0ead6, roughness: .6 }));
    this.cupMesh.visible = false;
    this.props.add(this.monitor, this.monStand, this.keyboard, this.cupMesh);
    world.scene.add(this.props);

    // kursi tetap di meja saat karyawan pergi jalan/meeting
    this.ghostChair = this.chair.clone(true);
    this.ghostChair.visible = false;
    world.scene.add(this.ghostChair);

    // kursi kantor kecil
    this.chair = new THREE.Group();
    const seatMat = new THREE.MeshStandardMaterial({ color: `hsl(${data.hue} 30% 30%)`, roughness: .9 });
    const cSeat = new THREE.Mesh(new THREE.BoxGeometry(.42, .07, .42), seatMat); cSeat.position.y = .45;
    const cBack = new THREE.Mesh(new THREE.BoxGeometry(.42, .5, .07), seatMat); cBack.position.set(0, .72, .2);
    const cPost = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .4, 8),
      new THREE.MeshStandardMaterial({ color: 0x181c24, metalness: .6, roughness: .4 })); cPost.position.y = .22;
    const cBase = new THREE.Mesh(new THREE.CylinderGeometry(.24, .28, .05, 10),
      new THREE.MeshStandardMaterial({ color: 0x181c24 })); cBase.position.y = .03;
    this.chair.add(cSeat, cBack, cPost, cBase);
    world.scene.add(this.chair);

    // efek
    this.fxGroup = new THREE.Group();
    world.scene.add(this.fxGroup);
    this.sweat = null; this.fire = null; this.zzz = null;

    // state gerak
    this.state = 'walk';           // walk | work | coffee | meeting | gone
    this.path = [];                // daftar waypoint Vector3
    this.targetPos = new THREE.Vector3();
    this.faceTarget = 0;           // yaw target
    this.animT = rnd() * 10;
    this.busySmooth = data.busyness;
    this.dead = false;

    if (data.seat) this.placeAtDesk(true);
    else this.spawnToPantry();
  }

  get deskInfo() { return this.world.deskFor(this.data.desk); }

  placeAtDesk(instant = false) {
    const w = this.world;
    const seatPos = w.seatWorldPos(this.data.seat);          // posisi kursi
    const facing = w.seatFacing(this.data.seat);             // yaw menghadap meja
    this.state = 'walk';
    this.path = [seatPos.clone()];
    this.arriveCb = () => {
      this.state = 'work';
      this.faceTarget = facing;
      this.atSeat = seatPos.clone();
      this.workOffset.copy(seatPos).add(new THREE.Vector3(Math.sin(facing) * .78, 0, Math.cos(facing) * .78));
    };
    if (instant) {
      this.group.position.copy(seatPos);
      this.group.rotation.y = facing;
      this.state = 'work';
      this.faceTarget = facing;
      this.atSeat = seatPos.clone();
      this.workOffset.copy(seatPos).add(new THREE.Vector3(Math.sin(facing) * .78, 0, Math.cos(facing) * .78));
    }
  }

  spawnToPantry() {
    const w = this.world;
    this.state = 'walk';
    const spot = w.pantrySpot();
    this.path = [spot.clone()];
    this.arriveCb = () => { this.state = 'coffee'; this.coffeeUntil = performance.now() + 6000 + this.rnd() * 9000; };
  }

  goToMeeting(spot) {
    this.state = 'walk';
    this.path = [spot.clone()];
    this.arriveCb = () => { this.state = 'meeting'; this.meetingUntil = performance.now() + 9000 + this.rnd() * 12000; };
  }

  updateData(d) {
    const movedSeat = JSON.stringify(d.seat) !== JSON.stringify(this.data.seat);
    const movedDesk = JSON.stringify(d.desk) !== JSON.stringify(this.data.desk);
    this.data = d;
    if (movedSeat || (movedDesk && d.seat)) {
      if (this.state === 'work' || this.state === 'walk') this.placeAtDesk();
    }
    if (!d.seat && this.state === 'work') this.spawnToPantry();
  }

  // saat karyawan pergi jalan kaki/meeting, kursinya tetap terisi di meja
  get displaySeat() { return this.atSeat || this.group.position; }

  fadeOut() { this.dead = true; this.fade = 1; }

  update(dt, now, load01) {
    this.animT += dt;
    this.busySmooth += Math.min(1, dt * 3) * (this.data.busyness - this.busySmooth);

    if (this.dead) {
      this.fade -= dt * 1.6;
      const s = Math.max(0, this.fade);
      this.group.scale.setScalar(s);
      this.props.visible = this.chair.visible = false;
      if (this.fade <= 0) this.dispose();
      return;
    }

    // ---------- gerak ----------
    let moving = false;
    if (this.state === 'walk' && this.path.length) {
      const tgt = this.path[0];
      const dir = new THREE.Vector3().subVectors(tgt, this.group.position); dir.y = 0;
      const dist = dir.length();
      if (dist < .06) {
        this.path.shift();
        if (!this.path.length && this.arriveCb) { const cb = this.arriveCb; this.arriveCb = null; cb(); }
      } else {
        dir.normalize();
        const sp = this.speed * (this.state === 'walk' ? 1 : 1) * dt;
        this.group.position.addScaledVector(dir, Math.min(sp, dist));
        this.faceTarget = Math.atan2(dir.x, dir.z);
        moving = true;
      }
    }

    // rotasi halus menghadap target
    let dy = this.faceTarget - this.group.rotation.y;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    this.group.rotation.y += dy * Math.min(1, dt * 8);

    // ---------- animasi pose per state ----------
    const b = this.busySmooth;
    const swing = moving ? Math.sin(this.animT * 9) * .55 : 0;
    const bobY = moving ? Math.abs(Math.sin(this.animT * 9)) * .04 : 0;

    if (this.state === 'work') {
      // duduk: kaki ditekuk, tangan mengetik di depan
      this.group.position.lerp(this.atSeat || this.group.position, Math.min(1, dt * 6));
      const typing = .18 + b * .85;
      const t = this.animT * (4 + b * 16);
      this.arms[0].rotation.x = -1.25 - Math.sin(t) * .12 * typing;
      this.arms[1].rotation.x = -1.25 - Math.sin(t + 1.7) * .12 * typing;
      this.arms[0].rotation.z = .25; this.arms[1].rotation.z = -.25;
      this.legs.forEach(l => l.rotation.x = -1.35);
      this.head.rotation.x = .28 + Math.sin(t * .3) * .03;
      this.head.rotation.z = Math.sin(this.animT * .8) * .04;
      this.torso.position.y = .56; // turun ke kursi
      this.blob.scale.setScalar(.8);
      // layar berkedip mengikuti kesibukan
      this.screenMat.color.setScalar(1);
      this.props.visible = this.chair.visible = true;
      this.ghostChair.visible = false;
      this.layoutWorkProps(now);
    } else {
      this.arms.forEach((a, i) => {
        a.rotation.x = swing * (i ? -1 : 1);
        a.rotation.z = .08 * (i ? -1 : 1);
      });
      this.legs.forEach((l, i) => l.rotation.x = swing * (i ? 1 : -1) * .8);
      this.head.rotation.x = moving ? -.05 : Math.sin(this.animT * 1.2) * .06 - .02;
      this.torso.position.y = .62 + bobY;
      this.blob.scale.setScalar(1);
      this.props.visible = false;
      this.chair.visible = false;
      if (this.state === 'coffee') {
        this.arms[0].rotation.x = -1.9; // memegang cangkir
        this.faceTarget = Math.PI; // menghadap ruang
      }
      if (this.state === 'meeting') {
        this.faceTarget = Math.sin(this.animT * .5) * .4 + Math.PI;
        this.arms[1].rotation.x = -1.6 - Math.sin(this.animT * 2) * .3;
      }
    }

    // antena menyala sesuai kesibukan
    this.antBall.material.emissiveIntensity = .5 + b * 2.5;
    this.antBall.position.y = 1.44 + Math.sin(this.animT * 3 + this.pid) * .01;

    // ---------- efek emoji ----------
    this.updateFx(dt, now, load01, moving);

    // timer state santai
    if (this.state === 'coffee' && now > this.coffeeUntil && this.data.seat) this.placeAtDesk();
    if (this.state === 'meeting' && now > this.meetingUntil) {
      if (this.data.seat) this.placeAtDesk(); else this.spawnToPantry();
    }
  }

  layoutWorkProps(now) {
    // f = yaw HADAP karakter (dari pusat kursi menuju tengah sel meja)
    const f = this.faceTarget;
    const fwd = new THREE.Vector3(Math.sin(f), 0, Math.cos(f));
    const right = new THREE.Vector3(Math.cos(f), 0, -Math.sin(f));
    const seat = this.atSeat;
    const jx = ((this.pid % 7) - 3) * .12;
    const monPos = seat.clone().addScaledVector(fwd, .95).addScaledVector(right, jx);
    this.monitor.position.set(monPos.x, .95, monPos.z);
    this.monitor.rotation.set(0, f + Math.PI, 0); // layar menghadap punggung->layar hadap karakter
    this.screen.rotation.x = -.14;               // sedikit mendongak ke mata
    this.monStand.position.set(monPos.x, .8, monPos.z);
    const kbPos = seat.clone().addScaledVector(fwd, .58).addScaledVector(right, jx);
    this.keyboard.position.set(kbPos.x, .79, kbPos.z);
    this.keyboard.rotation.y = f;
    this.chair.position.set(seat.x, 0, seat.z);
    this.chair.rotation.y = f + Math.PI;         // sandaran di belakang punggung
    // gelas kopi muncul saat sangat sibuk
    const needCup = this.busySmooth > .55;
    this.cupMesh.visible = needCup;
    if (needCup) {
      const cp = seat.clone().addScaledVector(fwd, .66).addScaledVector(right, jx > 0 ? -.45 : .45);
      this.cupMesh.position.set(cp.x, .83, cp.z);
    }
  }

  updateFx(dt, now, load01, moving) {
    const wantSweat = this.state === 'work' && this.busySmooth > .75;
    const wantFire = this.state === 'work' && load01 > .85 && this.busySmooth > .5;
    const wantZzz = this.state === 'work' && this.busySmooth < .06;

    if (wantSweat && !this.sweat) {
      this.sweat = makeEmojiSprite('💦');
      this.fxGroup.add(this.sweat);
    }
    if (!wantSweat && this.sweat) { this.fxGroup.remove(this.sweat); disposeSprite(this.sweat); this.sweat = null; }
    if (this.sweat) {
      this.sweat.position.copy(this.group.position).add(new THREE.Vector3(.3, 1.35 + Math.sin(now * .004) * .05, 0));
    }

    if (wantFire && !this.fire) {
      this.fire = makeEmojiSprite('🔥');
      this.fxGroup.add(this.fire);
    }
    if (!wantFire && this.fire) { this.fxGroup.remove(this.fire); disposeSprite(this.fire); this.fire = null; }
    if (this.fire) {
      this.fire.position.copy(this.group.position).add(new THREE.Vector3(-.32, 1.5 + Math.sin(now * .006 + 2) * .06, 0));
      this.fire.scale.setScalar(.55 + Math.sin(now * .01) * .06);
    }

    if (wantZzz && !this.zz) {
      this.zz = makeEmojiSprite('💤');
      this.fxGroup.add(this.zz);
    }
    if (!wantZzz && this.zz) { this.fxGroup.remove(this.zz); disposeSprite(this.zz); this.zz = null; }
    if (this.zz) {
      this.zz.position.copy(this.group.position).add(new THREE.Vector3(.28, 1.5 + Math.sin(now * .002) * .08, 0));
    }
  }

  dispose() {
    this.world.scene.remove(this.group, this.props, this.chair, this.ghostChair, this.fxGroup);
    [this.group, this.props, this.chair, this.ghostChair, this.fxGroup].forEach(g =>
      g.traverse(o => { if (o.material && o.material.map) o.material.map.dispose(); }));
  }
}

function disposeSprite(sp) {
  if (sp.material.map) sp.material.map.dispose();
  sp.material.dispose();
}
