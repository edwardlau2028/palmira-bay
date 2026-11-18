// PALMIRA BAY — wanted level and police. Crimes raise the heat 0-5 stars;
// the heat cools off when the player stays out of sight, faster in a
// spray-shop (safehouse) or when hidden. Police cruisers chase and ram,
// foot cops chase on foot and punch, and at 4+ stars a roadblock of cruisers
// waits near the player. Getting caught (busted) or killed (wasted) costs cash.
import { clamp, dist2d, angleLerp, angleDiff } from './util.js';
import { makeCar } from './vehicles.js';
import { makePersonMesh } from './pedestrians.js';

export class Police {
  constructor(G) {
    this.G = G;
    this.coolTimer = 0;
    this.spawnTimer = 0;
    this.roadblockTimer = 0;
    this.bustHold = 0; // seconds a cruiser has held the player still
  }
  addWanted(n, why) {
    const G = this.G;
    const before = G.wanted;
    G.wanted = clamp(G.wanted + n, 0, 5);
    if (G.wanted > before) {
      G.hud.flashFeed(`Wanted level ${G.wanted} — ${why}.`);
      G.audio.setSiren(G.wanted > 0);
    }
    this.coolTimer = 0;
  }
  clearWanted() {
    this.G.wanted = 0;
    this.G.audio.setSiren(false);
    for (const c of this.G.policeCars) { c.alive = false; c.mesh.visible = false; }
    for (const c of this.G.cops) { c.alive = false; c.mesh.visible = false; }
  }
  spawnCruiser() {
    const G = this.G, p = G.player;
    const a = Math.random() * Math.PI * 2;
    const x = clamp(p.x + Math.sin(a) * 55, -230, 230);
    const z = clamp(p.z + Math.cos(a) * 55, -230, 235);
    let car = G.policeCars.find(c => !c.alive);
    if (!car) {
      car = makeCar(G.scene, 'police', x, z, 0, { police: true });
      car.mesh.traverse(o => { if (o.material) o.material = o.material.clone(); });
      // Light bar on the roof.
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      bar.position.y = 1.62; car.mesh.add(bar);
      car.lightBar = bar;
      G.policeCars.push(car);
    } else {
      car.alive = true; car.mesh.visible = true;
      car.x = x; car.z = z; car.speed = 0; car.hp = 100;
    }
    car.mesh.position.set(x, 0, z);
    return car;
  }
  spawnCop() {
    const G = this.G, p = G.player;
    let cop = G.cops.find(c => !c.alive);
    if (!cop) {
      const mesh = makePersonMesh(0x1a2a4a, 0xe8b890);
      G.scene.add(mesh);
      cop = { mesh, x: p.x, z: p.z, heading: 0, alive: true, speed: 0, hitCd: 0 };
      G.cops.push(cop);
    }
    const a = Math.random() * Math.PI * 2;
    cop.alive = true; cop.mesh.visible = true;
    cop.x = clamp(p.x + Math.sin(a) * 22, -230, 230);
    cop.z = clamp(p.z + Math.cos(a) * 22, -230, 235);
    cop.mesh.position.set(cop.x, 0, cop.z);
    return cop;
  }
  update(dt) {
    const G = this.G, p = G.player;
    if (G.state !== 'play') return;
    const wanted = G.wanted;
    const wantCars = wanted === 0 ? 0 : wanted === 1 ? 1 : wanted === 2 ? 2 : wanted === 3 ? 3 : 4;
    const aliveCars = G.policeCars.filter(c => c.alive).length;
    this.spawnTimer -= dt;
    if (aliveCars < wantCars && this.spawnTimer <= 0) {
      this.spawnCruiser();
      this.spawnTimer = 2.5;
    }
    // Foot cops from 2 stars up.
    if (wanted >= 2) {
      const aliveCops = G.cops.filter(c => c.alive).length;
      if (aliveCops < wanted - 1 && this.spawnTimer <= 0) { this.spawnCop(); this.spawnTimer = 3; }
    }
    // Roadblock: park two cruisers across the road ahead at 4+ stars.
    if (wanted >= 4) {
      this.roadblockTimer -= dt;
      if (this.roadblockTimer <= 0) {
        this.roadblockTimer = 18;
        const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
        for (const off of [-4, 4]) {
          const c = this.spawnCruiser();
          c.x = clamp(p.x + fx * 42 - fz * off, -230, 230);
          c.z = clamp(p.z + fz * 42 + fx * off, -230, 235);
          c.heading = p.heading + Math.PI / 2;
          c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.heading;
          c.speed = 0; c.static = true;
        }
        G.hud.flashFeed('Roadblock ahead!');
      }
    }
    // Cruisers: chase, ram, and try to box the player in.
    for (const c of G.policeCars) {
      if (!c.alive) continue;
      if (wanted === 0) { c.speed = Math.max(0, c.speed - 20 * dt); }
      const d = dist2d(c.x, c.z, p.x, p.z);
      if (d > 160) { c.alive = false; c.mesh.visible = false; continue; }
      // A parked roadblock cruiser holds its ground until the player is
      // close, then joins the chase.
      if (c.static) {
        if (c.lightBar) c.lightBar.material.color.setHex(Math.sin(G.time * 12) > 0 ? 0xff2222 : 0x2255ff);
        if (d > 25) continue;
        c.static = false;
      }
      const target = Math.atan2(p.x - c.x, p.z - c.z);
      const diff = angleDiff(c.heading, target);
      c.heading += clamp(diff, -1, 1) * Math.min(1, dt * 2.4);
      const want = wanted === 0 ? 0 : clamp(d * 0.9, 12, 14 + wanted * 5);
      c.speed += (want - c.speed) * Math.min(1, dt * 1.4);
      let nx = c.x + Math.sin(c.heading) * c.speed * dt;
      let nz = c.z + Math.cos(c.heading) * c.speed * dt;
      for (const b of G.city.colliders) {
        const hit = { x: nx, z: nz };
        const cx = clamp(nx, b.x - b.w / 2, b.x + b.w / 2);
        const cz = clamp(nz, b.z - b.d / 2, b.z + b.d / 2);
        if (Math.hypot(nx - cx, nz - cz) < 1.7) { nx = c.x; nz = c.z; c.speed *= 0.3; }
        void hit;
      }
      c.x = nx; c.z = nz;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      if (c.lightBar) c.lightBar.material.color.setHex(Math.sin(G.time * 12) > 0 ? 0xff2222 : 0x2255ff);
      // Ram: touch the player and hurt them / slow their car. A bust needs
      // the cruiser to hold a slow player for 2 seconds, not one touch.
      if (d < 3.6) {
        if (p.inCar && p.car) { p.car.speed *= 0.82; p.car.hp -= 2; }
        else if (G.time - p.lastHurt > 1) { p.lastHurt = G.time; this.G.hurtPlayer(12, 'rammed'); }
        const slow = p.inCar ? Math.abs(p.car.speed) < 2 : Math.abs(p.speed) < 1.5;
        const bustable = (p.inCar && wanted >= 3) || (!p.inCar && wanted >= 2);
        if (slow && bustable) {
          this.bustHold += dt;
          if (this.bustHold > 2) { this.bustHold = 0; this.bust(); }
        } else this.bustHold = 0;
      } else this.bustHold = 0;
    }
    // Foot cops: run at the player and punch.
    for (const cop of G.cops) {
      if (!cop.alive) continue;
      const d = dist2d(cop.x, cop.z, p.x, p.z);
      if (wanted === 0 || d > 120) { cop.alive = false; cop.mesh.visible = false; continue; }
      const target = Math.atan2(p.x - cop.x, p.z - cop.z);
      cop.heading = angleLerp(cop.heading, target, Math.min(1, dt * 6));
      const sp = p.inCar ? 0 : 6.4;
      cop.x += Math.sin(cop.heading) * sp * dt;
      cop.z += Math.cos(cop.heading) * sp * dt;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      cop.hitCd -= dt;
      if (d < 1.8 && cop.hitCd <= 0 && !p.inCar) {
        cop.hitCd = 1.1;
        this.G.hurtPlayer(10, 'cop punch');
      }
    }
    // Heat cools off when the player is far from every cruiser and cop.
    if (wanted > 0) {
      const nearest = Math.min(
        ...G.policeCars.filter(c => c.alive).map(c => dist2d(c.x, c.z, p.x, p.z)), 999);
      if (nearest > 70) {
        this.coolTimer += dt;
        if (this.coolTimer > 9) { G.wanted--; this.coolTimer = 0; G.hud.flashFeed('Heat cooling off…'); if (G.wanted === 0) G.audio.setSiren(false); }
      } else this.coolTimer = 0;
    }
  }
  bust() {
    const G = this.G;
    if (G.state !== 'play') return;
    G.stats.busted++;
    G.endGame('busted');
  }
}
