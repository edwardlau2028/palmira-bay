// PALMIRA BAY — the city itself. A sun-soaked coastal grid at golden hour:
// glass downtown towers in the north, Old Town and the market in the west,
// a marina and harbour piers in the east, a long beach, pier and lighthouse
// in the south, and a palm park at the centre. Builds every mesh once and
// returns colliders, road lines and the named places missions share.
import { mulberry32, rand, pick } from './util.js';

export const CITY = { half: 240, roadStep: 40, beachZ: 200, oceanZ: 232 };

function facadeTexture(rng, base, lit, neon) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 120; y += 12) for (let x = 6; x < 58; x += 12) {
    g.fillStyle = rng() < 0.38 ? lit : 'rgba(18,30,48,0.92)';
    g.fillRect(x, y, 8, 7);
  }
  if (neon) { g.fillStyle = neon; g.fillRect(4, 4, 56, 5); g.fillRect(4, 119, 56, 5); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function signTexture(text, bg, fg) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 64);
  g.fillStyle = fg; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makePalm(rng) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.34, 5.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a6a42 }));
  trunk.position.y = 2.7; trunk.castShadow = true; g.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e4f });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.4, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.3, 5.6, Math.sin(a) * 1.3);
    leaf.rotation.z = Math.cos(a) * 1.1; leaf.rotation.x = -Math.sin(a) * 1.1;
    g.add(leaf);
  }
  const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b4a1f }));
  nuts.position.y = 5.2; g.add(nuts);
  return g;
}

export function buildCity(scene) {
  const rng = mulberry32(20261119);
  const colliders = [];
  const roads = [];
  for (let v = -200; v <= 200; v += CITY.roadStep) roads.push(v);

  // Golden-hour sky, warm sun, long shadows.
  scene.background = new THREE.Color(0xffc98a);
  scene.fog = new THREE.Fog(0xf2b878, 200, 640);
  const hemi = new THREE.HemisphereLight(0xffe0b8, 0x7a6a4a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.1);
  sun.position.set(-140, 170, 90); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -280; sun.shadow.camera.right = 280;
  sun.shadow.camera.top = 280; sun.shadow.camera.bottom = -280;
  sun.shadow.camera.far = 700;
  scene.add(sun);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(26, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }));
  glow.position.set(-260, 70, -260); scene.add(glow);

  // Ground: warm pavement base, dark asphalt roads, sand beach, blue sea.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(580, 580),
    new THREE.MeshLambertMaterial({ color: 0x9a8a68 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xd8c86a });
  const sandMat = new THREE.MeshLambertMaterial({ color: 0xeed9a0 });
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(580, 60), sandMat);
  beach.rotation.x = -Math.PI / 2; beach.position.set(0, 0.06, CITY.beachZ + 30);
  beach.receiveShadow = true; scene.add(beach);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(580, 130),
    new THREE.MeshLambertMaterial({ color: 0x1b7fa8 }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, 0.03, CITY.oceanZ + 92);
  scene.add(ocean);
  for (const v of roads) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(440, 11), roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.08, v); h.receiveShadow = true; scene.add(h);
    const vv = new THREE.Mesh(new THREE.PlaneGeometry(11, 440), roadMat);
    vv.rotation.x = -Math.PI / 2; vv.position.set(v, 0.08, 0); vv.receiveShadow = true; scene.add(vv);
    for (let d = -200; d <= 200; d += 16) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.5), dashMat);
      dash.rotation.x = -Math.PI / 2; dash.position.set(d, 0.1, v); scene.add(dash);
    }
  }

  // Buildings sit in the middle of each block (centres at road+20), so the
  // roads themselves stay clear for driving: downtown glass towers north,
  // low pastel Old Town west, warehouses by the harbour east, shops and
  // flats elsewhere.
  const palette = ['#e8b48a', '#d98a7a', '#f2d8a0', '#a8c8d8', '#c8a8d8', '#e8e0d0', '#9ac8a8'];
  const neon = ['#ff5a8a', '#39d0ff', '#ffd23e', '#7dff9a', null];
  const signs = ['HOTEL', 'CASINO', 'TACOS', 'PIER 9', 'GARAGE', 'MARKET', 'CLUB', 'MOTEL'];
  let signI = 0;
  // Block centres are road+20 (roads run on multiples of 40, blocks sit
  // between them), so no building ever stands on a road.
  for (let gx = -200; gx <= 160; gx += CITY.roadStep) {
    for (let gz = -200; gz <= 160; gz += CITY.roadStep) {
      const cx = gx + 20, cz = gz + 20;
      if (cx === 0 && cz === 0) continue; // central park
      const downtown = cz <= -100;
      const harbour = cx >= 140 && cz >= 60;
      const h = downtown ? rand(rng, 34, 78) : harbour ? rand(rng, 8, 16) : rand(rng, 10, 30);
      const w = rand(rng, 18, 26), d = rand(rng, 18, 26);
      const tex = facadeTexture(rng, pick(rng, palette), downtown ? '#ffe9a8' : '#ffd98a', pick(rng, neon));
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(cx, h / 2, cz); b.castShadow = true; b.receiveShadow = true;
      scene.add(b);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 2, d * 0.5),
        new THREE.MeshLambertMaterial({ color: 0x5a5a60 }));
      roof.position.set(cx, h + 1, cz); scene.add(roof);
      if (rng() < 0.35) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5),
          new THREE.MeshBasicMaterial({ map: signTexture(signs[signI++ % signs.length], '#101828', pick(rng, ['#ffd23e', '#ff5a8a', '#39d0ff'])) }));
        s.position.set(cx, Math.min(h, 14), cz + d / 2 + 0.2); scene.add(s);
      }
      colliders.push({ x: cx, z: cz, w, d });
    }
  }

  // Central park: lawn, pond, palms, benches.
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(36, 36),
    new THREE.MeshLambertMaterial({ color: 0x4a9a4a }));
  lawn.rotation.x = -Math.PI / 2; lawn.position.set(0, 0.12, 0); lawn.receiveShadow = true; scene.add(lawn);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(7, 24),
    new THREE.MeshLambertMaterial({ color: 0x2a8ab8 }));
  pond.rotation.x = -Math.PI / 2; pond.position.set(6, 0.14, -4); scene.add(pond);

  // Palms along the beach road and the park.
  for (let x = -200; x <= 200; x += 20) {
    const p = makePalm(rng); p.position.set(x + rand(rng, -3, 3), 0, 192); scene.add(p);
    if (rng() < 0.5) { const q = makePalm(rng); q.position.set(x, 0, 12); scene.add(q); }
  }
  // Street lamps along the avenues.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x333a44 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let v = -200; v <= 200; v += 40) for (const [x, z] of [[v, -206], [v, 206], [-206, v], [206, v]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 6, 6), lampMat);
    pole.position.set(x, 3, z); scene.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), bulbMat);
    bulb.position.set(x, 6.2, z); scene.add(bulb);
  }

  // Harbour pier (east) and beach pier (south) + lighthouse.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(60, 1.2, 10), pierMat);
  pier.position.set(210, 0.6, 120); pier.receiveShadow = true; scene.add(pier);
  const pier2 = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 44), pierMat);
  pier2.position.set(0, 0.6, 216); scene.add(pier2);
  const light = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 22, 10),
    new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
  light.position.set(-232, 11, 216); light.castShadow = true; scene.add(light);
  const lightTop = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 3, 10),
    new THREE.MeshBasicMaterial({ color: 0xff5a4e }));
  lightTop.position.set(-232, 23, 216); scene.add(lightTop);

  // Golden beacon column used over the active objective.
  const beaconGeo = new THREE.CylinderGeometry(2.4, 2.4, 60, 12, 1, true);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffd23e, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.visible = false; scene.add(beacon);

  const places = {
    safehouse: { x: -160, z: 160, label: 'Safehouse' },
    garage: { x: -160, z: -160, label: "Mari's Garage" },
    marina: { x: 180, z: -40, label: 'Marina' },
    dropOff: { x: 180, z: 80, label: 'Drop-off' },
    warehouse: { x: 180, z: 160, label: 'Harbour Warehouse' },
    harbour: { x: 210, z: 120, label: 'Pier 9' },
    downtown: { x: 0, z: -180, label: 'Downtown' },
    beachBar: { x: -80, z: 200, label: 'Beach Bar' },
    market: { x: -180, z: 0, label: 'Old Town Market' },
    park: { x: 0, z: 0, label: 'Palm Park' },
    casino: { x: 80, z: -160, label: 'Casino Sol' },
    stadium: { x: -120, z: -80, label: 'Stadium' },
  };
  // Gold bars: 8 hidden collectibles across the districts.
  const goldSpots = [
    { x: -200, z: -200 }, { x: 200, z: -200 }, { x: -200, z: 40 }, { x: 200, z: 40 },
    { x: -40, z: 200 }, { x: 120, z: 200 }, { x: 40, z: -40 }, { x: -120, z: 120 },
  ];
  return { colliders, roads, places, beacon, goldSpots };
}
