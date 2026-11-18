// PALMIRA BAY — combat. Fists up close, a pistol with limited ammo and a
// visible tracer + muzzle flash, enemy thugs and guards who shoot back,
// health packs and ammo crates scattered around the city, and armour that
// soaks damage first. Kills raise the wanted level.
import { dist2d, clamp, rand, pick, mulberry32 } from './util.js';
import { makePersonMesh } from './pedestrians.js';

const THUG_SHIRTS = [0x3a3a3a, 0x5a2a2a, 0x2a3a5a];
export function spawnThugs(scene, x, z, n, guards = false) {
  const rng = mulberry32((Math.random() * 1e9) | 0);
  const thugs = [];
  for (let i = 0; i < n; i++) {
    const mesh = makePersonMesh(guards ? 0x8a6a1a : pick(rng, THUG_SHIRTS), pick(rng, [0xe8b890, 0xc98a5a]));
    const tx = x + rand(rng, -6, 6), tz = z + rand(rng, -6, 6);
    mesh.position.set(tx, 0, tz);
    scene.add(mesh);
    thugs.push({
      mesh, x: tx, z: tz, heading: rand(rng, 0, Math.PI * 2), alive: true,
      hp: guards ? 60 : 40, shootCd: rand(rng, 0.5, 2), guards,
      phase: rand(rng, 0, 6),
    });
  }
  return thugs;
}
export function updateThugs(thugs, dt, player, hurtPlayer, G) {
  for (const t of thugs) {
    if (!t.alive) continue;
    const d = dist2d(t.x, t.z, player.x, player.z);
    t.shootCd -= dt;
    if (d < 34) {
      t.heading = Math.atan2(player.x - t.x, player.z - t.z);
      if (d > 9) {
        t.x += Math.sin(t.heading) * 3.4 * dt;
        t.z += Math.cos(t.heading) * 3.4 * dt;
      } else if (t.shootCd <= 0 && !player.dead) {
        t.shootCd = t.guards ? 1.5 : 2.1;
        G.audio.blip(140, 0.1, 'square', 0.12);
        spawnTracer(G, t.x, 1.5, t.z, player.x, 1.3, player.z, 0xff4040);
        if (Math.random() < 0.45) hurtPlayer(t.guards ? 9 : 6);
      }
    }
    const swing = Math.sin(G.time * 9 + t.phase) * 0.5;
    t.mesh.userData.armL.rotation.x = swing;
    t.mesh.userData.armR.rotation.x = -swing;
    t.mesh.position.set(t.x, 0, t.z);
    t.mesh.rotation.y = t.heading;
  }
}
export function tryPunch(G) {
  const p = G.player;
  if (p.firing > 0) return;
  p.firing = 0.35;
  G.audio.punch();
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  for (const t of G.thugs) {
    if (!t.alive) continue;
    const d = dist2d(p.x + fx * 1.2, p.z + fz * 1.2, t.x, t.z);
    if (d < 2.2) { damageThug(G, t, 18); return; }
  }
  for (const c of G.cops) {
    if (!c.alive) continue;
    if (dist2d(p.x + fx * 1.2, p.z + fz * 1.2, c.x, c.z) < 2.2) {
      c.alive = false; c.mesh.visible = false;
      G.police.addWanted(1, 'attacking a cop');
      G.hud.flashFeed('You dropped a cop!');
      return;
    }
  }
  for (const ped of G.peds) {
    if (!ped.alive) continue;
    if (dist2d(p.x + fx * 1.2, p.z + fz * 1.2, ped.x, ped.z) < 2.0) {
      ped.alive = false; ped.mesh.visible = false;
      G.police.addWanted(1, 'assault');
      G.hud.flashFeed('That was not very nice.');
      return;
    }
  }
}
export function tryShoot(G) {
  const p = G.player;
  if (p.ammo <= 0) { G.hud.flashFeed('Out of ammo — find an ammo crate (green box).'); G.audio.blip(120, 0.08, 'square', 0.15); return; }
  p.ammo--; p.firing = 0.22;
  G.audio.shoot();
  G.hud.flashMuzzle();
  // Aim from the camera: forward from the player's view direction.
  const yaw = G.camYaw;
  const ox = p.x + Math.sin(yaw) * 0.8, oz = p.z + Math.cos(yaw) * 0.8;
  const ex = ox + Math.sin(yaw) * 60, ez = oz + Math.cos(yaw) * 60;
  spawnTracer(G, ox, 1.5, oz, ex, 1.5, ez, 0xffe9a8);
  let best = null, bd = 60;
  const consider = (x, z, obj) => {
    const dx = x - ox, dz = z - oz;
    const along = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const side = Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw));
    if (along > 0 && along < bd && side < 1.6) { best = obj; bd = along; }
  };
  for (const t of G.thugs) if (t.alive) consider(t.x, t.z, { kind: 'thug', t });
  for (const c of G.cops) if (c.alive) consider(c.x, c.z, { kind: 'cop', c });
  for (const ped of G.peds) if (ped.alive) consider(ped.x, ped.z, { kind: 'ped', ped });
  if (!best) return;
  if (best.kind === 'thug') damageThug(G, best.t, 25);
  else if (best.kind === 'cop') {
    best.c.alive = false; best.c.mesh.visible = false;
    G.police.addWanted(2, 'shooting a cop');
    G.hud.flashFeed('You shot a cop! The whole city is coming.');
  } else {
    best.ped.alive = false; best.ped.mesh.visible = false;
    G.police.addWanted(1, 'shooting a bystander');
  }
}
function damageThug(G, t, dmg) {
  t.hp -= dmg;
  spawnBurst(G, t.x, 1.4, t.z, 0xff5040);
  if (t.hp <= 0) {
    t.alive = false; t.mesh.visible = false;
    G.mission.thugsDown++;
    G.player.respect += 5;
    G.audio.blip(90, 0.2, 'sawtooth', 0.15);
    if (Math.random() < 0.4) { G.player.ammo += 12; G.hud.flashFeed('+12 ammo'); }
  }
}
export function damagePlayer(G, dmg) {
  const p = G.player;
  if (p.dead || G.state !== 'play') return;
  let rest = dmg;
  if (p.armor > 0) { const soaked = Math.min(p.armor, rest); p.armor -= soaked; rest -= soaked; }
  p.health -= rest;
  p.lastHurt = G.time;
  G.hud.flashDamage();
  G.audio.blip(90, 0.15, 'sawtooth', 0.2);
  if (p.health <= 0) {
    p.health = 0; p.dead = true;
    G.stats.wasted++;
    G.endGame('wasted');
  }
}
// A short-lived line from muzzle to target, plus a burst of sparks.
export function spawnTracer(G, x1, y1, z1, x2, y2, z2, color) {
  const geo = new THREE.BufferGeometry().setFromPoints(
    [new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
  line.userData.ttl = 0.09;
  G.scene.add(line);
  G.effects.push(line);
}
export function spawnBurst(G, x, y, z, color) {
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22),
      new THREE.MeshBasicMaterial({ color }));
    s.position.set(x + (Math.random() - 0.5), y + (Math.random() - 0.5), z + (Math.random() - 0.5));
    s.userData.ttl = 0.4; s.userData.vy = rand(Math.random, 1, 3);
    G.scene.add(s); G.effects.push(s);
  }
}
export function updateEffects(G, dt) {
  for (let i = G.effects.length - 1; i >= 0; i--) {
    const e = G.effects[i];
    e.userData.ttl -= dt;
    if (e.userData.vy) e.position.y += e.userData.vy * dt;
    if (e.userData.ttl <= 0) {
      G.scene.remove(e);
      if (e.geometry) e.geometry.dispose();
      G.effects.splice(i, 1);
    }
  }
}
// Health (red cross) and ammo (green box) pickups around the map.
export function spawnPickups(scene) {
  const spots = [
    { kind: 'health', x: -156, z: 156 }, { kind: 'ammo', x: 176, z: 76 },
    { kind: 'health', x: 4, z: 4 }, { kind: 'ammo', x: -176, z: -4 },
    { kind: 'armor', x: 84, z: -156 }, { kind: 'health', x: 176, z: -44 },
    { kind: 'ammo', x: -84, z: 196 }, { kind: 'armor', x: -116, z: -84 },
  ];
  const out = [];
  for (const s of spots) {
    const color = s.kind === 'health' ? 0xff4040 : s.kind === 'ammo' ? 0x39d353 : 0x39a0ff;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1),
      new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(s.x, 0.8, s.z);
    mesh.castShadow = true;
    scene.add(mesh);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 1.2),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    cap.position.set(s.x, 1.05, s.z);
    scene.add(cap);
    out.push({ ...s, mesh, cap, taken: false });
  }
  return out;
}
export function updatePickups(G, dt) {
  const p = G.player;
  for (const pk of G.pickups) {
    if (pk.taken) continue;
    pk.mesh.rotation.y += dt * 1.5;
    pk.cap.rotation.y += dt * 1.5;
    pk.mesh.position.y = 0.8 + Math.sin(G.time * 2 + pk.x) * 0.15;
    if (dist2d(p.x, p.z, pk.x, pk.z) < 2.2) {
      pk.taken = true; pk.mesh.visible = false; pk.cap.visible = false;
      if (pk.kind === 'health') { p.health = clamp(p.health + 40, 0, 100); G.hud.flashFeed('+40 health'); }
      if (pk.kind === 'ammo') { p.ammo += 24; G.hud.flashFeed('+24 ammo'); }
      if (pk.kind === 'armor') { p.armor = clamp(p.armor + 50, 0, 100); G.hud.flashFeed('+50 armour'); }
      G.audio.pickup();
    }
  }
}
