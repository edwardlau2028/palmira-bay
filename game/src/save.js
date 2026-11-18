// PALMIRA BAY — save system. Progress lives in localStorage under one key:
// cash, respect, mission index, gold bars found, cars stolen, stats and the
// player's last safe position. Missions auto-save when a job is finished.
const KEY = 'palmira-bay-save-v3';
export class SaveSys {
  constructor(G) { this.G = G; }
  hasSave() {
    try { return !!localStorage.getItem(KEY); } catch { return false; }
  }
  snapshot() {
    const G = this.G, p = G.player;
    return {
      v: 3, money: p.money, respect: p.respect, health: p.health, ammo: p.ammo,
      armor: p.armor, mission: G.mission.index, gold: G.goldFound.slice(),
      carsStolen: G.stats.carsStolen, busted: G.stats.busted, wasted: G.stats.wasted,
      playMinutes: G.stats.playMinutes, x: p.x, z: p.z, heading: p.heading,
      clock: G.clock, radio: G.audio.station,
    };
  }
  save(silent) {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.snapshot()));
      if (!silent) this.G.hud.flashFeed('Game saved.');
      return true;
    } catch { return false; }
  }
  load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
  }
  apply(d) {
    if (!d) return false;
    const G = this.G, p = G.player;
    p.money = d.money ?? 250; p.respect = d.respect ?? 0;
    p.health = d.health ?? 100; p.ammo = d.ammo ?? 48; p.armor = d.armor ?? 0;
    p.x = d.x ?? 0; p.z = d.z ?? 40; p.heading = d.heading ?? 0;
    G.clock = d.clock ?? 17 * 60 + 20;
    G.goldFound = Array.isArray(d.gold) ? d.gold.slice() : [];
    G.stats.carsStolen = d.carsStolen ?? 0; G.stats.busted = d.busted ?? 0;
    G.stats.wasted = d.wasted ?? 0; G.stats.playMinutes = d.playMinutes ?? 0;
    G.audio.station = d.radio ?? 0;
    G.mission.start(d.mission ?? 0);
    return true;
  }
  clear() { try { localStorage.removeItem(KEY); } catch { /* private mode */ } }
}
