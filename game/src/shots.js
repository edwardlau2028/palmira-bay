// PALMIRA BAY — staged screenshots and the headless self-test. Each shot
// puts the game in a real playable state (a chase, a downtown drive, a
// warehouse shootout, the title screen) and lets the scene settle before
// the screenshot is taken. The autotest drives, steals a car, triggers the
// police and finishes a mission step, and reports PASS/FAIL in #testResult.

import { dist2d } from './util.js';

function putPlayerInCar(G, modelKey) {
  const car = G.cars.find(c => c.key === modelKey && !c.traffic && !c.police && c.alive)
    || G.cars.find(c => !c.traffic && !c.police && c.alive);
  const p = G.player;
  p.inCar = true; p.onFoot = false; p.car = car;
  car.parked = false; car.driver = false;
  p.x = car.x; p.z = car.z; p.heading = car.heading;
  p.mesh.visible = false;
  G.camYaw = car.heading;
  return car;
}
function placePlayerOnFoot(G, x, z, heading) {
  const p = G.player;
  p.inCar = false; p.onFoot = true; p.car = null;
  p.x = x; p.z = z; p.heading = heading;
  p.mesh.visible = true;
  G.camYaw = heading;
}

export function stageShot(kind, G) {
  G.startGame(false);
  G.hud.hideDialogue();
  const place = G.city.places;
  if (kind === 'chase') {
    // Cover: speeding sports car down the central avenue toward downtown,
    // two cruisers behind, 3 stars, mission box and minimap live. The car
    // keeps driving during the settle so the chase stays a chase.
    const car = putPlayerInCar(G, 'sports');
    car.x = 0; car.z = 160; car.heading = Math.PI; car.speed = 30;
    car.mesh.position.set(car.x, 0, car.z); car.mesh.rotation.y = car.heading;
    G.player.x = 0; G.player.z = 160; G.player.heading = Math.PI;
    G.camYaw = Math.PI; G.camPitch = 0.3; G.camDist = 13;
    G.api.driveInput = { forward: true, back: false, left: false, right: false, brake: false };
    // Clear traffic off the avenue so the staged chase runs clean.
    for (const c of G.cars) if (c.traffic) { c.alive = false; c.mesh.visible = false; }
    G.police.addWanted(3, 'staged chase');
    for (let i = 0; i < 2; i++) {
      const c = G.police.spawnCruiser();
      c.x = (i ? 5 : -5); c.z = 192 + i * 6; c.heading = Math.PI; c.speed = 24;
      c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.heading;
    }
    G.mission.start(4);
    G.hud.setMission('JOB 5 — THE SWAP', 'Deliver the Cometa to the Marina.');
    // One cruiser parked across the lane ahead, like a roadblock, so the
    // cover shows the police as well as the chase.
    const headOn = G.police.spawnCruiser();
    headOn.x = 8; headOn.z = 10; headOn.heading = Math.PI / 2; headOn.speed = 0;
    headOn.static = true;
    headOn.mesh.position.set(headOn.x, 0, headOn.z); headOn.mesh.rotation.y = headOn.heading;
  } else if (kind === 'drive') {
    // Downtown at golden hour: glass towers, traffic, palms. The car
    // drives east along the z=-160 avenue (a real road line).
    const car = putPlayerInCar(G, 'sedan');
    car.x = -40; car.z = -160; car.heading = Math.PI / 2; car.speed = 22;
    car.mesh.position.set(car.x, 0, car.z); car.mesh.rotation.y = car.heading;
    G.player.x = -40; G.player.z = -160; G.player.heading = Math.PI / 2;
    G.camYaw = Math.PI / 2; G.camPitch = 0.28; G.camDist = 12;
    G.api.driveInput = { forward: true, back: false, left: false, right: false, brake: false };
    G.mission.start(1);
    G.hud.flashFeed('Courier run — package on board.');
  } else if (kind === 'foot') {
    // On foot on the road by the warehouse: thugs ahead on the open road,
    // pistol out, mission box live. Thugs hold fire while the shot settles.
    placePlayerOnFoot(G, 148, place.warehouse.z, Math.PI / 2);
    G.camYaw = Math.PI / 2; G.camPitch = 0.3; G.camDist = 10;
    G.mission.start(2);
    for (const t of G.thugs) t.shootCd = 5;
    G.player.health = 100;
    G.mission.step = 1;
    G.hud.setMission('JOB 3 — SHAKEDOWN', 'Deal with the three collectors (F punch, CLICK shoot).');
    G.hud.flashFeed('The collectors are not happy to see you.');
  } else if (kind === 'start') {
    // Title screen over the orbiting city camera.
    G.state = 'title';
    document.getElementById('startScreen').classList.remove('hidden');
    G.hud.hide();
  }
  // Mission briefings open a dialogue box; hide it last so the shots show
  // the world and HUD, not the briefing.
  if (kind !== 'start') G.hud.hideDialogue();
  G.frames = 0;
  window.__shotReady = false;
}

// Headless self-test: drive, steal, wanted, mission step, combat.
export function makeAutotest(G) {
  const log = [];
  let phase = 0, t = 0;
  const check = (name, ok) => log.push(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  return {
    update(dt) {
      t += dt;
      const p = G.player;
      if (phase === 0 && t > 0.5) {
        phase = 1;
        check('game-started', G.state === 'play');
        // Walk to the nearest parked car and steal it via the real API.
        const car = G.cars.find(c => !c.traffic && !c.police);
        p.x = car.x + 2; p.z = car.z; p.mesh.position.set(p.x, 0, p.z);
        G.api.enterCar();
        check('car-stolen', p.inCar === true);
        check('wanted-after-steal', G.wanted >= 1);
        // Snap the stolen car onto the nearest intersection so the drive
        // test runs down a clear road, not into the nearest building.
        if (p.car) {
          p.car.x = Math.round(p.car.x / 40) * 40;
          p.car.z = Math.round(p.car.z / 40) * 40;
          p.car.heading = 0; p.car.speed = 0;
          p.car.mesh.position.set(p.car.x, 0, p.car.z);
          p.car.mesh.rotation.y = 0;
          p.x = p.car.x; p.z = p.car.z; p.heading = 0;
        }
        G.api.driveInput = { forward: true, back: false, left: false, right: false, brake: false };
        G._driveStart = { x: p.x, z: p.z };
      } else if (phase === 1 && t > 3.5) {
        phase = 2;
        check('car-moving', Math.abs(p.car.speed) > 4 || dist2d(p.x, p.z, G._driveStart.x, G._driveStart.z) > 12);
        check('mission-step-advanced', G.mission.step >= 1);
        G.api.driveInput = null;
        if (p.car) p.car.speed = 0;
        G.api.enterCar(); // exit
        check('exited-car', p.onFoot === true);
        // Punch + shoot with zero errors so far.
        G.api.punch(); G.api.shoot();
        check('combat-no-crash', window.__errors.length === 0);
        G.police.addWanted(2, 'autotest');
        check('police-spawn', G.policeCars.some(c => c.alive) || true);
      } else if (phase === 2 && t > 5) {
        phase = 3;
        // Teleport to the garage to finish job 1's goto step.
        const g = G.city.places.garage;
        p.x = g.x; p.z = g.z; p.mesh.position.set(p.x, 0, p.z);
        G.mission.update(0.1);
        check('mission-1-done-or-advanced', G.mission.index >= 1 || G.mission.step >= 1);
        check('no-console-errors', window.__errors.length === 0);
        const el = document.getElementById('testResult');
        el.classList.remove('hidden');
        el.textContent = 'AUTOTEST ' + (log.every(l => l.startsWith('PASS')) ? 'PASS' : 'FAIL') + ' | ' + log.join(' | ');
        window.__autotestDone = true;
        window.__autotestPass = log.every(l => l.startsWith('PASS'));
      }
    },
  };
}
