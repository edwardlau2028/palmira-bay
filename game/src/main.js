// PALMIRA BAY — Streets of Sun & Gold. Main loop: input, camera, on-foot
// and driving movement, and the wiring that ties the city, cars, pedestrians,
// police, missions, combat, HUD, audio and saving together. Everything is
// original: Palmira Bay, Rico Vega, Mari Duarte, and every street, car and
// song are invented here.
import { buildCity, CITY } from './city.js';
import { spawnWorldCars, driveCar, updateTraffic } from './vehicles.js';
import { spawnPedestrians, updatePedestrians, makePersonMesh, nearestShout } from './pedestrians.js';
import { Police } from './police.js';
import { MissionRunner } from './missions.js';
import { Hud } from './hud.js';
import { AudioSys } from './audio.js';
import { SaveSys } from './save.js';
import { tryPunch, tryShoot, spawnThugs, updateThugs, damagePlayer, spawnPickups, updatePickups, updateEffects, spawnBurst } from './combat.js';
import { stageShot, makeAutotest } from './shots.js';
import { clamp, dist2d, angleLerp, collideCircleBox } from './util.js';

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1000);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const G = {
  scene, camera, time: 0, state: 'title', clock: 17 * 60 + 25,
  player: {
    x: 0, z: 40, heading: 0, health: 100, armor: 0, money: 250, respect: 0, ammo: 48,
    onFoot: true, inCar: false, car: null, dead: false, firing: 0, speed: 0,
    lastHurt: -99, mesh: null,
  },
  wanted: 0, camYaw: 0, camPitch: 0.32, camDist: 11,
  keys: {}, dialogueOpen: false, autotest: null, effects: [],
  cars: [], policeCars: [], cops: [], peds: [], thugs: [], pickups: [],
  goldFound: [], goldMeshes: [],
  stats: { carsStolen: 0, busted: 0, wasted: 0, playMinutes: 0 },
  city: null, hud: null, audio: new AudioSys(), save: null, police: null, mission: null,
};
G.save = new SaveSys(G);
G.hud = new Hud(G);
window.__game = G; // debug hook for the self-test and screenshots
G.police = new Police(G);
G.mission = new MissionRunner(G);

G.city = buildCity(scene);
G.cars = spawnWorldCars(scene, Math.random);
G.peds = spawnPedestrians(scene, 30);
G.pickups = spawnPickups(scene);

// Gold bars: 8 glowing collectibles worth $150 each.
for (let i = 0; i < G.city.goldSpots.length; i++) {
  const s = G.city.goldSpots[i];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }));
  mesh.position.set(s.x, 0.7, s.z);
  scene.add(mesh);
  G.goldMeshes.push(mesh);
}

// Rico Vega, the player character.
const playerMesh = makePersonMesh(0x2ab08a, 0xe8b890);
playerMesh.scale.setScalar(1.05);
scene.add(playerMesh);
G.player.mesh = playerMesh;
const beacon = G.city.beacon;

// ---- shared helpers used by police / combat ----
G.hurtPlayer = (dmg) => damagePlayer(G, dmg);
G.missionArmFight = () => {
  for (const t of G.thugs) { t.mesh.visible = false; t.alive = false; }
  // Fight on the road beside the warehouse, not inside the building block.
  G.thugs = spawnThugs(scene, G.city.places.warehouse.x - 18, G.city.places.warehouse.z, 3);
  G.mission.thugsDown = 0;
};
G.missionArmPier = () => {
  for (const t of G.thugs) { t.mesh.visible = false; t.alive = false; }
  G.thugs = spawnThugs(scene, G.city.places.harbour.x - 8, G.city.places.harbour.z, 4, true);
  G.mission.thugsDown = 0;
};

// ---- input ----
window.addEventListener('keydown', (e) => {
  G.keys[e.code] = true;
  if (e.code === 'Enter' && G.dialogueOpen) G.hud.hideDialogue();
  if ((e.code === 'KeyP' || e.code === 'Escape') && G.state !== 'title') togglePause();
  if (e.code === 'KeyM') { G.audio.setMuted(!G.audio.muted); G.hud.flashFeed(G.audio.muted ? 'Sound muted.' : 'Sound on.'); }
  if (e.code === 'KeyR' && G.state === 'play') G.hud.flashFeed(G.audio.cycleStation());
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
    G.audio.station = Number(e.code.slice(-1)) - 1;
    if (G.state === 'play') G.hud.flashFeed('Radio: ' + ['RADIO SOL', 'PALM FM', 'BAY 88'][G.audio.station]);
  }
  if (e.code === 'KeyS' && G.state === 'play') G.save.save();
  if (e.code === 'KeyF' && G.state === 'play' && G.player.onFoot) tryPunch(G);
  if (e.code === 'KeyE' && G.state === 'play') enterOrExitCar();
  if (e.code === 'KeyC' && G.state === 'play') G.camDist = G.camDist > 14 ? 11 : 17;
});
window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });
let dragging = false, lastX = 0, lastY = 0, shootCd = 0;
canvas.addEventListener('mousedown', (e) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  if (G.state === 'play' && G.player.onFoot && shootCd <= 0) { shootCd = 0.28; tryShoot(G); }
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  G.camYaw -= (e.clientX - lastX) * 0.005;
  G.camPitch = clamp(G.camPitch + (e.clientY - lastY) * 0.004, 0.05, 0.9);
  lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('mouseup', () => { dragging = false; });
canvas.addEventListener('wheel', (e) => {
  G.camDist = clamp(G.camDist + Math.sign(e.deltaY) * 1.5, 6, 20);
}, { passive: true });

// ---- car enter / exit (stealing included) ----
function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const c of G.cars) {
    if (c.police || c.traffic || !c.alive) continue;
    const d = dist2d(G.player.x, G.player.z, c.x, c.z);
    if (d < bd) { best = c; bd = d; }
  }
  return best;
}
function enterOrExitCar() {
  const p = G.player;
  if (p.inCar) {
    if (Math.abs(p.car.speed) > 5) { G.hud.flashFeed('Too fast — slow down to get out.'); return; }
    const car = p.car;
    p.x = car.x + Math.sin(car.heading + Math.PI / 2) * 3;
    p.z = car.z + Math.cos(car.heading + Math.PI / 2) * 3;
    p.heading = car.heading;
    p.inCar = false; p.onFoot = true; p.car = null;
    p.mesh.visible = true;
    G.audio.setEngine(0, false);
    return;
  }
  const car = nearestCar(4.5);
  if (!car) { G.hud.flashFeed('No car close by — walk up to one and press E.'); return; }
  if (car.driver) {
    car.driver = false;
    const flee = G.peds.find(pd => !pd.alive);
    if (flee) {
      flee.alive = true; flee.mesh.visible = true;
      flee.x = car.x + 2; flee.z = car.z + 2; flee.panic = 5;
      flee.mesh.position.set(flee.x, 0, flee.z);
    }
    G.police.addWanted(1, 'carjacking');
    G.hud.flashFeed('You dragged the driver out!');
    const shout = nearestShout(G.peds, car.x, car.z);
    if (shout) G.hud.flashFeed(shout);
  } else {
    G.police.addWanted(1, 'grand theft auto');
    G.hud.flashFeed(`You stole the ${car.model.name}!`);
  }
  G.stats.carsStolen++;
  car.parked = false;
  p.inCar = true; p.onFoot = false; p.car = car;
  p.x = car.x; p.z = car.z; p.heading = car.heading;
  p.mesh.visible = false;
  G.audio.blip(220, 0.15, 'square', 0.15);
}

// ---- screens ----
function show(id, on) { document.getElementById(id).classList.toggle('hidden', !on); }
G.startGame = (fromSave) => {
  G.audio.ensure();
  if (fromSave) {
    const data = G.save.load();
    if (data) G.save.apply(data);
  } else {
    const p = G.player;
    p.money = 250; p.respect = 0; p.health = 100; p.armor = 0; p.ammo = 48;
    p.x = 0; p.z = 40; p.heading = 0; p.dead = false;
    G.wanted = 0; G.goldFound = [];
    G.mission.start(0);
  }
  show('startScreen', false); show('pauseScreen', false); show('endScreen', false);
  G.hud.show();
  G.state = 'play';
  if (!fromSave) G.hud.showDialogue('Mari', G.mission.current().briefing);
};
function togglePause() {
  if (G.state === 'play') {
    G.state = 'paused';
    document.getElementById('pauseStats').textContent =
      `Cash $${G.player.money} · Respect ${G.player.respect} · Gold ${G.goldFound.length}/8 · ${G.mission.current() ? G.mission.current().title : 'All jobs done'} · Cars stolen ${G.stats.carsStolen}`;
    show('pauseScreen', true);
  } else if (G.state === 'paused') {
    G.state = 'play'; show('pauseScreen', false);
  }
}
G.endGame = (kind) => {
  G.state = 'over';
  G.audio.setSiren(false); G.audio.setEngine(0, false);
  const title = document.getElementById('endTitle');
  const text = document.getElementById('endText');
  if (kind === 'busted') {
    title.textContent = 'BUSTED';
    text.textContent = 'The Palmira PD dragged you out of the car. You lose 10% of your cash to bail, but Mari still has work for you — if you can get back on your feet.';
    G.player.money = Math.floor(G.player.money * 0.9);
  } else {
    title.textContent = 'WASTED';
    text.textContent = 'Palmira Bay got the better of you this time. You wake up at the safehouse, patched up and $200 lighter, with the same seven jobs waiting.';
    G.player.money = Math.max(0, G.player.money - 200);
  }
  show('endScreen', true);
};
function respawn() {
  const p = G.player;
  const s = G.city.places.safehouse;
  p.x = s.x; p.z = s.z; p.heading = 0; p.health = 100; p.armor = 25; p.dead = false;
  p.inCar = false; p.onFoot = true; p.car = null; p.mesh.visible = true;
  G.wanted = 0;
  G.police.clearWanted();
  G.audio.setSiren(false);
  show('endScreen', false);
  G.state = 'play';
  G.mission.start(G.mission.index);
  G.hud.flashFeed('Back on your feet. The city is still yours to take.');
}

document.getElementById('btnNew').addEventListener('click', () => G.startGame(false));
document.getElementById('btnContinue').addEventListener('click', () => G.startGame(true));
document.getElementById('btnHow').addEventListener('click', () => {
  document.getElementById('controlsList').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
document.getElementById('btnResume').addEventListener('click', togglePause);
document.getElementById('btnSave').addEventListener('click', () => G.save.save());
document.getElementById('btnQuit').addEventListener('click', () => {
  G.state = 'title'; show('pauseScreen', false); show('startScreen', true); G.hud.hide();
});
document.getElementById('btnRetry').addEventListener('click', respawn);
document.getElementById('btnEndTitle').addEventListener('click', () => {
  G.state = 'title'; show('endScreen', false); show('startScreen', true); G.hud.hide();
});
if (!G.save.hasSave()) document.getElementById('btnContinue').disabled = true;

G.api = {
  enterCar: enterOrExitCar,
  shoot: () => tryShoot(G),
  punch: () => tryPunch(G),
  driveInput: null,
};

// ---- per-frame updates ----
function updatePlayerOnFoot(dt) {
  const p = G.player, k = G.keys;
  const f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
  const r = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
  if (f !== 0 || r !== 0) {
    const moveAngle = G.camYaw + Math.atan2(r, f);
    p.heading = angleLerp(p.heading, moveAngle, Math.min(1, dt * 12));
    const sprint = k.ShiftLeft || k.ShiftRight;
    p.speed = sprint ? 9.5 : 5.5;
    let nx = p.x + Math.sin(moveAngle) * p.speed * dt;
    let nz = p.z + Math.cos(moveAngle) * p.speed * dt;
    for (const b of G.city.colliders) {
      const hit = collideCircleBox(nx, nz, 0.9, b);
      if (hit) { nx = hit.x; nz = hit.z; }
    }
    p.x = clamp(nx, -238, 238); p.z = clamp(nz, -238, 250);
    const swing = Math.sin(G.time * 11) * 0.55;
    p.mesh.userData.armL.rotation.x = swing;
    p.mesh.userData.armR.rotation.x = -swing;
    p.mesh.userData.legs.rotation.x = swing * 0.7;
  } else {
    p.speed = 0;
    p.mesh.userData.armL.rotation.x = 0;
    p.mesh.userData.armR.rotation.x = 0;
    p.mesh.userData.legs.rotation.x = 0;
  }
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;
}

function updateCamera(dt) {
  const p = G.player;
  const target = new THREE.Vector3(p.x, 0, p.z);
  if (G.state === 'title') {
    const a = G.time * 0.045;
    camera.position.set(Math.sin(a) * 175, 95, Math.cos(a) * 175);
    camera.lookAt(0, 12, 0);
    return;
  }
  if (p.inCar) G.camYaw = angleLerp(G.camYaw, p.car.heading, Math.min(1, dt * 1.5));
  const dist = p.inCar ? G.camDist + 3 : G.camDist;
  const h = p.inCar ? 5.4 : 4.4;
  const desired = new THREE.Vector3(
    target.x - Math.sin(G.camYaw) * dist,
    h + Math.sin(G.camPitch) * 6,
    target.z - Math.cos(G.camYaw) * dist);
  let pull = 1;
  for (const f of [1, 0.8, 0.6, 0.45, 0.3, 0.18]) {
    pull = f;
    const px = target.x + (desired.x - target.x) * f;
    const pz = target.z + (desired.z - target.z) * f;
    let inside = false;
    for (const b of G.city.colliders) {
      if (px > b.x - b.w / 2 - 2 && px < b.x + b.w / 2 + 2 &&
          pz > b.z - b.d / 2 - 2 && pz < b.z + b.d / 2 + 2) { inside = true; break; }
    }
    if (!inside) break;
  }
  const camTarget = new THREE.Vector3(
    target.x + (desired.x - target.x) * pull, desired.y + (1 - pull) * 12,
    target.z + (desired.z - target.z) * pull);
  camera.position.lerp(camTarget, Math.min(1, dt * 6));
  camera.lookAt(target.x, 2.2, target.z);
}

function collectGold() {
  const p = G.player;
  G.city.goldSpots.forEach((s, i) => {
    if (G.goldFound.includes(i)) return;
    if (dist2d(p.x, p.z, s.x, s.z) < 2.6) {
      G.goldFound.push(i);
      G.goldMeshes[i].visible = false;
      p.money += 150; p.respect += 2;
      G.audio.coin();
      G.hud.flashFeed(`Gold bar found! +$150 (${G.goldFound.length}/8)`);
      if (G.goldFound.length === 8) G.hud.flashFeed('All 8 gold bars — Mari is impressed.');
    }
  });
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = clamp((now - last) / 1000, 0.001, 0.05);
  last = now;
  G.time += dt;
  shootCd = Math.max(0, shootCd - dt);
  const p = G.player;
  p.firing = Math.max(0, p.firing - dt);
  if (G.state === 'play') {
    G.clock += dt * 0.6; // one game hour per ~100 real seconds
    G.stats.playMinutes += dt / 60;
    const input = { forward: false, back: false, left: false, right: false, brake: false };
    if (G.api.driveInput) Object.assign(input, G.api.driveInput);
    const k = G.keys;
    input.forward = input.forward || !!k.KeyW;
    input.back = input.back || !!k.KeyS;
    input.left = input.left || !!k.KeyA;
    input.right = input.right || !!k.KeyD;
    input.brake = input.brake || !!k.Space;
    if (p.inCar && p.car) {
      const prevHp = p.car.hp;
      driveCar(p.car, input, dt, G.city.colliders, G.cars);
      if (p.car.hp < prevHp - 3) { G.audio.crash(); spawnBurst(G, p.car.x, 1, p.car.z, 0xffa040); }
      if (p.car.hp <= 0) {
        p.car.hp = 60;
        G.hud.flashFeed('Your car is wrecked — bail out before it blows!');
        p.car.speed *= 0.3;
      }
      p.x = p.car.x; p.z = p.car.z; p.heading = p.car.heading;
      for (const ped of G.peds) {
        if (ped.alive && dist2d(p.x, p.z, ped.x, ped.z) < 2.2 && Math.abs(p.car.speed) > 4) {
          ped.alive = false; ped.mesh.visible = false;
          G.police.addWanted(1, 'hit and run');
        }
      }
    } else if (p.onFoot) {
      updatePlayerOnFoot(dt);
    }
    for (const c of G.cars) if (c.traffic) updateTraffic(c, dt, G.city.colliders, G.cars);
    updatePedestrians(G.peds, dt, { x: p.x, z: p.z, speed: p.inCar ? Math.abs(p.car?.speed || 0) : p.speed, firing: p.firing > 0 }, G.time);
    updateThugs(G.thugs, dt, p, (d) => { p.lastHurt = G.time; damagePlayer(G, d); }, G);
    updatePickups(G, dt);
    updateEffects(G, dt);
    collectGold();
    G.police.update(dt);
    G.mission.update(dt);
    if (G.time - p.lastHurt > 6 && p.health < 100) p.health = clamp(p.health + 2.5 * dt, 0, 100);
    const t = G.mission.targetPos();
    if (t && !G.mission.done) {
      beacon.visible = true;
      beacon.position.set(t.x, 30, t.z);
      beacon.material.opacity = 0.28 + Math.sin(G.time * 3) * 0.1;
    } else beacon.visible = false;
    for (let i = 0; i < G.goldMeshes.length; i++) {
      if (!G.goldFound.includes(i)) G.goldMeshes[i].rotation.y += dt * 2;
    }
    G.audio.setEngine(p.inCar ? Math.abs(p.car.speed) / 40 : 0, p.inCar);
    G.audio.sirenTick(G.time);
    G.audio.musicTick(dt);
    G.hud.update();
    if (G.autotest) G.autotest.update(dt);
  }
  if (G.shot) {
    G.frames = (G.frames || 0) + 1;
    if (G.frames > 70) window.__shotReady = true;
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}

// ---- boot: title screen, or a staged screenshot / self-test ----
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
G.shot = shot;
if (params.get('autotest') === '1') {
  G.startGame(false);
  G.autotest = makeAutotest(G);
} else if (shot) {
  stageShot(shot, G);
}
requestAnimationFrame(loop);
