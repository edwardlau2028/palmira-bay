// PALMIRA BAY — HUD: wanted stars, cash, health and armour bars, in-game
// clock, radio station, mission box, feed messages, dialogue, speedometer,
// crosshair, damage vignette, and the live minimap (roads, beach, districts,
// player arrow, police blips, mission marker, gold bars).
import { formatMoney, formatClock, clamp } from './util.js';
import { STATIONS } from './audio.js';

export class Hud {
  constructor(G) {
    this.G = G;
    this.el = (id) => document.getElementById(id);
    this.map = this.el('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.feedTimer = 0;
    this.dialogueTimer = 0;
  }
  show() { this.el('hud').classList.remove('hidden'); }
  hide() { this.el('hud').classList.add('hidden'); }
  setMission(title, text) {
    this.el('missionTitle').textContent = title;
    this.el('missionText').textContent = text;
  }
  setTimer(seconds) {
    const el = this.el('missionTimer');
    el.textContent = seconds === null ? '' : `⏱ ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} left`;
  }
  showDialogue(name, text) {
    this.el('dialogueName').textContent = name;
    this.el('dialogueText').textContent = text;
    this.el('dialogue').classList.remove('hidden');
    this.G.dialogueOpen = true;
    this.dialogueTimer = 9;
  }
  hideDialogue() {
    this.el('dialogue').classList.add('hidden');
    this.G.dialogueOpen = false;
  }
  flashFeed(msg) {
    const feed = this.el('feed');
    const div = document.createElement('div');
    div.textContent = msg;
    feed.appendChild(div);
    while (feed.children.length > 4) feed.removeChild(feed.firstChild);
    this.feedTimer = 5;
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 5200);
  }
  flashDamage() {
    const d = this.el('damage');
    d.style.opacity = '1';
    setTimeout(() => { d.style.opacity = '0'; }, 180);
  }
  flashMuzzle() {
    const c = this.el('crosshair');
    c.style.color = '#ffd23e';
    setTimeout(() => { c.style.color = '#fff'; }, 90);
  }
  update() {
    const G = this.G, p = G.player;
    const stars = this.el('stars');
    let html = '';
    for (let i = 0; i < 5; i++) html += `<span class="${i < G.wanted ? '' : 'off'}">★</span>`;
    stars.innerHTML = html;
    this.el('money').textContent = formatMoney(p.money);
    this.el('healthBar').style.width = clamp(p.health, 0, 100) + '%';
    this.el('armorBar').style.width = clamp(p.armor, 0, 100) + '%';
    this.el('respect').textContent = `Respect ${p.respect} · Ammo ${p.ammo} · Gold ${G.goldFound.length}/8`;
    this.el('clock').textContent = formatClock(G.clock) + '  ·  ' + STATIONS[G.audio.station].name;
    const speedo = this.el('speedo');
    if (p.inCar && p.car) {
      speedo.classList.remove('hidden');
      this.el('carName').textContent = p.car.model.name + (p.car.hp < 45 ? '  — SMOKING!' : '');
      this.el('speedNum').textContent = Math.round(Math.abs(p.car.speed) * 2.2);
    } else speedo.classList.add('hidden');
    this.el('crosshair').classList.toggle('hidden', !p.onFoot);
    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= 1 / 60;
      if (this.dialogueTimer <= 0) this.hideDialogue();
    }
    this.drawMinimap();
  }
  drawMinimap() {
    const G = this.G, ctx = this.mapCtx, S = 200;
    const half = 250, scale = S / (half * 2);
    const toMap = (x, z) => [(x + half) * scale, (z + half) * scale];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#274b5e'; ctx.fillRect(0, 0, S, S);
    // Beach + ocean strip at the south edge.
    ctx.fillStyle = '#e8d29a'; ctx.fillRect(0, (200 + half) * scale, S, S - (200 + half) * scale);
    ctx.fillStyle = '#2a7fa8'; ctx.fillRect(0, (232 + half) * scale, S, S - (232 + half) * scale);
    // Park.
    ctx.fillStyle = '#3f8a3f'; ctx.fillRect(...toMap(-18, -18), 36 * scale, 36 * scale);
    // Roads.
    ctx.strokeStyle = '#5a6068'; ctx.lineWidth = 4;
    for (const v of G.city.roads) {
      const [x1, y1] = toMap(v, -240), [x2, y2] = toMap(v, 240);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [ax, ay] = toMap(-240, v), [bx, by] = toMap(240, v);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    // District labels.
    ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
    const labels = [['DOWNTOWN', 0, -190], ['OLD TOWN', -180, -20], ['MARINA', 185, -60], ['BEACH', -60, 215], ['HARBOUR', 195, 130]];
    for (const [t, x, z] of labels) { const [mx, my] = toMap(x, z); ctx.fillText(t, mx, my); }
    // Gold bars not yet found.
    ctx.fillStyle = '#ffd23e';
    G.city.goldSpots.forEach((g, i) => {
      if (G.goldFound.includes(i)) return;
      const [mx, my] = toMap(g.x, g.z);
      ctx.fillRect(mx - 2, my - 2, 4, 4);
    });
    // Mission target.
    const t = G.mission.targetPos();
    if (t && !G.mission.done) {
      const [mx, my] = toMap(t.x, t.z);
      const r = 7 + Math.sin(G.time * 5) * 2;
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Police blips.
    ctx.fillStyle = '#4a90ff';
    for (const c of G.policeCars) if (c.alive) { const [mx, my] = toMap(c.x, c.z); ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ff4040';
    for (const c of G.cops) if (c.alive) { const [mx, my] = toMap(c.x, c.z); ctx.fillRect(mx - 2, my - 2, 4, 4); }
    // Player arrow.
    const [px, py] = toMap(G.player.x, G.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(G.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial'; ctx.fillText('N', S - 10, 12);
  }
}
