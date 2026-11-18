// PALMIRA BAY — pedestrians. Colourful locals who stroll the sidewalks,
// cross at corners, panic and run when shots ring out or a car bears down,
// and sometimes shout at the player. Drivers dragged out of a stolen car
// become fleeing pedestrians. Built from simple jointed box figures.
import { clamp, dist2d, rand, pick, mulberry32 } from './util.js';

const SHIRTS = [0xe85a5a, 0x5a8ae8, 0x5ac86e, 0xe8c85a, 0xc85ae8, 0x5ad8e8, 0xe8e8e8, 0x8a5a2e];
const SKINS = [0xe8b890, 0xc98a5a, 0x8a5a30, 0xf2d0a8];
export function makePersonMesh(shirt, skin) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2e3a4a });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), skinMat);
  head.position.y = 1.72; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.22, 0.58),
    new THREE.MeshLambertMaterial({ color: 0x1a1210 }));
  hair.position.y = 2.02; g.add(hair);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.45), shirtMat);
  torso.position.y = 1.05; torso.castShadow = true; g.add(torso);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), skinMat);
  armL.position.set(-0.55, 1.05, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.55; g.add(armR);
  const legs = new THREE.Group();
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.75, 0.3), pantsMat);
  legL.position.set(-0.2, 0.38, 0); legs.add(legL);
  const legR = legL.clone(); legR.position.x = 0.2; legs.add(legR);
  g.add(legs);
  g.userData = { armL, armR, legs, head };
  return g;
}
export function spawnPedestrians(scene, count) {
  const rng = mulberry32(777);
  const peds = [];
  for (let i = 0; i < count; i++) {
    const mesh = makePersonMesh(pick(rng, SHIRTS), pick(rng, SKINS));
    const x = rand(rng, -210, 210), z = rand(rng, -210, 195);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push({
      mesh, x, z, heading: rand(rng, 0, Math.PI * 2), alive: true,
      speed: rand(rng, 1.2, 2.4), panic: 0, wait: rand(rng, 0, 4),
      phase: rand(rng, 0, 6), shoutCd: rand(rng, 4, 20),
    });
  }
  return peds;
}
export function updatePedestrians(peds, dt, threat, time) {
  for (const p of peds) {
    if (!p.alive) continue;
    const d = dist2d(p.x, p.z, threat.x, threat.z);
    if (threat.firing && d < 26) p.panic = 4;
    if (d < 5 && threat.speed > 6) p.panic = 3;
    p.wait -= dt;
    if (p.panic > 0) {
      p.panic -= dt;
      const away = Math.atan2(p.x - threat.x, p.z - threat.z);
      p.heading = away;
      p.x = clamp(p.x + Math.sin(away) * 5.5 * dt, -232, 232);
      p.z = clamp(p.z + Math.cos(away) * 5.5 * dt, -232, 244);
    } else if (p.wait <= 0) {
      // Stroll along the sidewalk grid; turn at intersections.
      if (Math.random() < dt * 0.25) p.heading += (Math.random() - 0.5) * 1.6;
      if (Math.random() < dt * 0.05) p.wait = rand(Math.random, 1, 5);
      p.x = clamp(p.x + Math.sin(p.heading) * p.speed * dt, -232, 232);
      p.z = clamp(p.z + Math.cos(p.heading) * p.speed * dt, -232, 244);
    }
    const swing = Math.sin(time * 9 + p.phase) * (p.panic > 0 ? 0.9 : 0.5);
    p.mesh.userData.armL.rotation.x = swing;
    p.mesh.userData.armR.rotation.x = -swing;
    p.mesh.userData.legs.rotation.x = swing * 0.7;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
    p.shoutCd -= dt;
  }
}
export function nearestShout(peds, px, pz) {
  for (const p of peds) {
    if (p.alive && p.shoutCd <= 0 && dist2d(p.x, p.z, px, pz) < 14) {
      p.shoutCd = 18;
      return pick(Math.random, [
        'Hey! Watch it!', 'Somebody call the cops!', 'That guy stole my car!',
        'Palmira is going crazy!', 'Did you see that?!', 'Not my car, man!',
      ]);
    }
  }
  return null;
}
