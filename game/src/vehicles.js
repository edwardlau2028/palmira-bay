// PALMIRA BAY — vehicles. Six original car models built from boxes and
// cylinders (sedan, taxi, hatchback, pickup, sports car, van), plus the
// police cruiser. Player driving is arcade: accelerate, steer, brake,
// handbrake drift, collision with buildings and other cars. Traffic cars
// follow the road grid, stop at random, and honk when blocked.
import { clamp, dist2d, angleLerp, collideCircleBox, rand, pick } from './util.js';
import { CITY } from './city.js';

export const CAR_MODELS = {
  sedan:   { name: 'Solano Sedan',   color: 0x3a6fd8, top: 34, accel: 16, grip: 2.6, len: 4.4, wid: 2.0 },
  taxi:    { name: 'Palm Cab',      color: 0xffc21c, top: 32, accel: 15, grip: 2.6, len: 4.4, wid: 2.0 },
  hatch:   { name: 'Breeze Hatch',  color: 0x39b8a0, top: 30, accel: 18, grip: 3.0, len: 3.8, wid: 1.9 },
  pickup:  { name: 'Dune Pickup',   color: 0xc8542e, top: 32, accel: 15, grip: 2.4, len: 4.8, wid: 2.1 },
  sports:  { name: 'Cometa GT',     color: 0xe83e6e, top: 46, accel: 24, grip: 3.4, len: 4.2, wid: 2.0 },
  van:     { name: 'Cargo Van',     color: 0xe8e4da, top: 28, accel: 12, grip: 2.2, len: 5.0, wid: 2.2 },
  police:  { name: 'Palmira PD',    color: 0x1a1a22, top: 40, accel: 20, grip: 3.0, len: 4.4, wid: 2.0 },
};

function buildCarMesh(model, color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x182838 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(model.wid, 0.75, model.len), paint);
  body.position.y = 0.62; body.castShadow = true; g.add(body);
  const cabinH = model === 'van' ? 1.05 : 0.62;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(model.wid * 0.86, cabinH,
    model.len * (model === 'pickup' ? 0.42 : 0.52)), glass);
  cabin.position.set(0, 1.18 + (model === 'van' ? 0.2 : 0), model === 'pickup' ? -model.len * 0.22 : 0);
  cabin.castShadow = true; g.add(cabin);
  if (model === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(model.wid * 0.9, 0.4, model.len * 0.4),
      new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));
    bed.position.set(0, 1.05, model.len * 0.26); g.add(bed);
  }
  if (model === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(model.wid * 0.9, 0.08, 0.5), paint);
    spoiler.position.set(0, 1.25, -model.len / 2 + 0.2); g.add(spoiler);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  for (const [x, z] of [[-model.wid / 2, model.len * 0.32], [model.wid / 2, model.len * 0.32],
                        [-model.wid / 2, -model.len * 0.32], [model.wid / 2, -model.len * 0.32]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.42, z); g.add(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.6, 0.6]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.1), lightMat);
    l.position.set(x, 0.7, model.len / 2 + 0.02); g.add(l);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const x of [-0.6, 0.6]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), tailMat);
    l.position.set(x, 0.7, -model.len / 2 - 0.02); g.add(l);
  }
  return g;
}
export function makeCar(scene, modelKey, x, z, heading, opts = {}) {
  const model = CAR_MODELS[modelKey];
  const mesh = buildCarMesh(model, opts.color ?? model.color);
  mesh.position.set(x, 0, z); mesh.rotation.y = heading;
  scene.add(mesh);
  return {
    key: modelKey, model, mesh, x, z, heading, speed: 0, steer: 0,
    parked: !!opts.parked, traffic: !!opts.traffic, police: !!opts.police,
    driver: opts.driver !== false, alive: true, smoke: 0, hp: 100,
    roadAxis: opts.roadAxis || 'z', roadLine: opts.roadLine ?? 0, dir: opts.dir || 1,
    wait: 0, honk: 0, targetSpeed: opts.targetSpeed || rand(Math.random, 10, 16),
  };
}
export function spawnWorldCars(scene, rng) {
  const cars = [];
  const keys = ['sedan', 'taxi', 'hatch', 'pickup', 'van', 'sports'];
  // Parked cars along the avenues.
  for (let i = 0; i < 12; i++) {
    const road = pick(rng, [-160, -120, -80, -40, 40, 80, 120, 160]);
    const along = rand(rng, -190, 190);
    const horiz = rng() < 0.5;
    cars.push(makeCar(scene, pick(rng, keys),
      horiz ? along : road + 7, horiz ? road + 7 : along,
      horiz ? Math.PI / 2 : 0, { parked: true, driver: rng() < 0.45 }));
  }
  // One sports car by the casino, one taxi by the marina — good first steals.
  cars.push(makeCar(scene, 'sports', 84, -152, Math.PI / 2, { parked: true, driver: false }));
  cars.push(makeCar(scene, 'taxi', 176, -32, 0, { parked: true, driver: true }));
  // Traffic: cars cruising the grid.
  for (let i = 0; i < 16; i++) {
    const road = pick(rng, [-200, -160, -120, -80, -40, 0, 40, 80, 120, 160, 200]);
    const horiz = rng() < 0.5;
    cars.push(makeCar(scene, pick(rng, ['sedan', 'taxi', 'hatch', 'pickup', 'van']),
      horiz ? rand(rng, -200, 200) : road + (rng() < 0.5 ? 2.6 : -2.6),
      horiz ? road + (rng() < 0.5 ? 2.6 : -2.6) : rand(rng, -200, 190),
      horiz ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI),
      { traffic: true, driver: true, roadAxis: horiz ? 'x' : 'z', roadLine: road, dir: rng() < 0.5 ? 1 : -1 }));
  }
  return cars;
}
export function driveCar(car, input, dt, colliders, cars) {
  const m = car.model;
  const target = input.forward ? m.accel : input.back ? -m.accel * 0.55 : 0;
  car.speed += (target * dt) - car.speed * (input.brake ? 2.6 : 0.35) * dt;
  car.speed = clamp(car.speed, -m.top * 0.45, m.top);
  if (input.brake && Math.abs(car.speed) > 2) car.speed *= (1 - 2.2 * dt);
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  car.steer = angleLerp(car.steer, steerTarget * 0.55, Math.min(1, dt * 8));
  const dir = car.speed >= 0 ? 1 : -1;
  car.heading += car.steer * m.grip * dt * clamp(Math.abs(car.speed) / 8, 0, 1.4) * dir;
  let nx = car.x + Math.sin(car.heading) * car.speed * dt;
  let nz = car.z + Math.cos(car.heading) * car.speed * dt;
  for (const b of colliders) {
    const hit = collideCircleBox(nx, nz, 1.7, b);
    if (hit) { nx = hit.x; nz = hit.z; if (Math.abs(car.speed) > 12) car.hp -= 6; car.speed *= 0.45; }
  }
  for (const o of cars) {
    if (o === car || !o.alive) continue;
    if (dist2d(nx, nz, o.x, o.z) < 3.4) {
      const push = 3.4 - dist2d(nx, nz, o.x, o.z);
      nx += Math.sin(car.heading) * -push * 0.4; nz += Math.cos(car.heading) * -push * 0.4;
      if (!o.traffic) { o.x += Math.sin(car.heading) * push * 0.3; o.z += Math.cos(car.heading) * push * 0.3; o.mesh.position.set(o.x, 0, o.z); }
      else {
        // Shove a traffic car forward so the player can push through a jam
        // instead of getting stuck behind a car that stopped at random.
        o.x += Math.sin(car.heading) * push * 0.5; o.z += Math.cos(car.heading) * push * 0.5;
        o.wait = 0; o.mesh.position.set(o.x, 0, o.z);
      }
      if (Math.abs(car.speed) > 10) { car.hp -= 4; car.speed *= 0.6; }
    }
  }
  car.x = clamp(nx, -CITY.half - 6, CITY.half + 6);
  car.z = clamp(nz, -CITY.half - 6, CITY.half + 14);
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // Body roll and wheel spin flavour.
  car.mesh.rotation.z = -car.steer * 0.05 * clamp(Math.abs(car.speed) / 20, 0, 1);
  car.smoke = car.hp < 45 ? 1 : car.hp < 70 ? 0.5 : 0;
}
export function updateTraffic(car, dt, colliders, cars) {
  if (!car.alive || !car.traffic) return;
  car.wait -= dt;
  // Car ahead? Slow down instead of ramming it.
  let blocked = false;
  for (const o of cars) {
    if (o === car || !o.alive) continue;
    const dx = o.x - car.x, dz = o.z - car.z;
    const ahead = car.roadAxis === 'x' ? dx * car.dir : dz * car.dir;
    const side = car.roadAxis === 'x' ? Math.abs(dz) : Math.abs(dx);
    if (ahead > 0 && ahead < 9 && side < 3) { blocked = true; break; }
  }
  const want = blocked ? 0 : car.targetSpeed;
  car.speed += (want - car.speed) * Math.min(1, dt * 1.2);
  if (car.wait > 0) car.speed = 0;
  else if (Math.random() < dt * 0.004) car.wait = rand(Math.random, 0.8, 1.6);
  const step = car.speed * car.dir * dt;
  if (car.roadAxis === 'x') car.x += step; else car.z += step;
  // Wrap around the far edge of the grid so traffic never runs out.
  if (car.x > 210) car.x = -210; if (car.x < -210) car.x = 210;
  if (car.z > 205) car.z = -210; if (car.z < -210) car.z = 205;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.roadAxis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
}
