// PALMIRA BAY — story and missions. Seven jobs from Mari Duarte, from a
// first stolen car to the gold heist on Pier 9. Each mission is a list of
// steps: steal a car, reach a place, win a fight, grab the goods, or lose
// the heat. Finishing a job pays cash and respect, auto-saves, and unlocks
// the next one. Eight hidden gold bars around the city pay $150 each.
import { dist2d } from './util.js';

export const MISSIONS = [
  {
    id: 'first-wheels', title: 'JOB 1 — FIRST WHEELS', giver: 'Mari',
    briefing: 'Rico. You need wheels before you need friends. Steal any car on the street — walk up to one and press E — then bring it to my garage. The boys there ask no questions.',
    reward: 300, respect: 10,
    steps: [
      { kind: 'steal', text: 'Steal a car (walk up to one and press E).' },
      { kind: 'goto', text: "Drive the stolen car to Mari's Garage.", target: 'garage' },
    ],
  },
  {
    id: 'courier', title: 'JOB 2 — COURIER RUN', giver: 'Mari',
    briefing: 'The casino moves chips through the marina. Take this package to the drop-off, then swing by the safehouse. Fast — the harbour boys watch the clock, and so do I.',
    reward: 500, respect: 10, timeLimit: 150,
    steps: [
      { kind: 'goto', text: 'Deliver the package to the Marina drop-off.', target: 'dropOff' },
      { kind: 'goto', text: 'Now check in at the Safehouse.', target: 'safehouse' },
    ],
  },
  {
    id: 'shakedown', title: 'JOB 3 — SHAKEDOWN', giver: 'Mari',
    briefing: 'Three collectors are leaning on my shops at the warehouse. Go and teach them manners. Fists or pistol — your call. Bring back what they owe me.',
    reward: 800, respect: 15,
    steps: [
      { kind: 'goto', text: 'Get to the Harbour Warehouse.', target: 'warehouse' },
      { kind: 'fight', text: 'Deal with the three collectors (F punch, CLICK shoot).', target: 'warehouse', count: 3 },
    ],
  },
  {
    id: 'heat', title: 'JOB 4 — BURN THE HEAT', giver: 'Mari',
    briefing: 'You made noise at the warehouse, Rico. The whole Palmira PD is awake. Lose them — three stars and counting — then get to the safehouse without getting dragged out of your car.',
    reward: 600, respect: 15,
    steps: [
      { kind: 'escape', text: 'Lose the police (wanted level back to 0).' },
      { kind: 'goto', text: 'Reach the Safehouse.', target: 'safehouse' },
    ],
  },
  {
    id: 'the-swap', title: 'JOB 5 — THE SWAP', giver: 'Mari',
    briefing: 'A buyer wants a Cometa GT, red, parked by the Casino Sol. Take it — quietly if you can — and bring it to the marina. The cops will not be quiet about it, so drive like you mean it.',
    reward: 1200, respect: 20,
    steps: [
      { kind: 'steal', text: 'Steal the red Cometa GT by Casino Sol.' },
      { kind: 'goto', text: 'Deliver the Cometa to the Marina.', target: 'marina' },
    ],
  },
  {
    id: 'pier-gold', title: 'JOB 6 — PIER 9 GOLD', giver: 'Mari',
    briefing: 'A gold case sits on Pier 9, guarded light because nobody would dare. Four guards, Rico. Grab the case, get to the marina drop-off, and we are both richer.',
    reward: 2000, respect: 25,
    steps: [
      { kind: 'goto', text: 'Reach Harbour Pier 9.', target: 'harbour' },
      { kind: 'fight', text: 'Deal with the four pier guards.', target: 'harbour', count: 4, guards: true },
      { kind: 'goto', text: 'Gold secured! Get to the Marina drop-off — fast.', target: 'dropOff' },
    ],
  },
  {
    id: 'the-big-one', title: 'JOB 7 — THE BIG ONE', giver: 'Mari',
    briefing: 'Last one. The casino vault truck stops at Downtown, the Market and the Beach Bar tonight. Hit all three, then vanish at the safehouse. Five stars of heat, Rico — make it count.',
    reward: 8000, respect: 50, timeLimit: 300,
    steps: [
      { kind: 'goto', text: 'Hit the vault truck stop — Downtown.', target: 'downtown' },
      { kind: 'goto', text: 'Next stop — Old Town Market.', target: 'market' },
      { kind: 'goto', text: 'Last stop — the Beach Bar.', target: 'beachBar' },
      { kind: 'goto', text: 'Vanish at the Safehouse.', target: 'safehouse' },
    ],
  },
];

export class MissionRunner {
  constructor(G) {
    this.G = G;
    this.index = 0; this.step = 0; this.stepTimer = 0;
    this.thugsDown = 0; this.done = false; this.failed = false;
  }
  current() { return MISSIONS[this.index] || null; }
  currentStep() { const m = this.current(); return m ? m.steps[this.step] : null; }
  targetPos() {
    const s = this.currentStep();
    if (!s || !s.target) return null;
    return this.G.city.places[s.target];
  }
  start(index = 0) {
    this.index = index; this.step = 0; this.stepTimer = 0;
    this.thugsDown = 0; this.done = false; this.failed = false;
    const m = this.current();
    if (!m) { this.done = true; return; }
    this.G.hud.setMission(m.title, m.steps[0].text);
    this.G.hud.showDialogue(m.giver, m.briefing);
    this.G.audio.missionDone();
    if (m.id === 'heat') this.G.police.addWanted(3, 'the warehouse job');
    if (m.id === 'the-swap') this.G.police.addWanted(1, 'the Cometa job');
    if (m.id === 'the-big-one') this.G.police.addWanted(2, 'the vault truck');
    if (m.id === 'shakedown') this.G.missionArmFight();
    if (m.id === 'pier-gold') this.G.missionArmPier();
  }
  advance() {
    const m = this.current();
    if (!m) return;
    this.step++;
    this.stepTimer = 0;
    if (this.step >= m.steps.length) { this.complete(); return; }
    const s = m.steps[this.step];
    this.G.hud.setMission(m.title, s.text);
    this.G.hud.flashFeed('Objective updated.');
    this.G.audio.pickup();
    if (s.kind === 'fight' && m.id === 'shakedown') this.G.missionArmFight();
    if (s.kind === 'fight' && m.id === 'pier-gold') this.G.missionArmPier();
    if (m.id === 'pier-gold' && this.step === 2) this.G.hud.flashFeed('Gold case secured!');
  }
  complete() {
    const G = this.G, m = this.current();
    G.player.money += m.reward;
    G.player.respect += m.respect;
    G.hud.flashFeed(`Job complete! +$${m.reward}  ·  +${m.respect} respect`);
    G.audio.missionDone();
    G.save.save(true);
    this.index++;
    this.step = 0; this.stepTimer = 0; this.thugsDown = 0;
    if (this.index >= MISSIONS.length) {
      this.done = true;
      G.hud.setMission('PALMIRA BAY — FREE ROAM', 'All seven jobs done. The city is yours: hunt the 8 gold bars, steal cars, outrun the PD.');
      G.hud.showDialogue('Mari', 'Seven jobs, Rico. The vault, the gold, the whole bay — you did it. Palmira is yours now. Go enjoy it.');
      return;
    }
    this.start(this.index);
  }
  fail(reason) {
    this.failed = true;
    this.G.hud.flashFeed(reason);
    this.G.audio.fail();
    this.start(this.index);
  }
  update(dt) {
    const G = this.G, m = this.current();
    if (!m || this.done || G.state !== 'play') return;
    const s = this.currentStep();
    if (!s) return;
    if (m.timeLimit) {
      this.stepTimer += dt;
      const left = Math.max(0, Math.ceil(m.timeLimit - this.stepTimer));
      G.hud.setTimer(left);
      if (this.stepTimer >= m.timeLimit) { this.fail('Too slow — the job fell through. Try again.'); return; }
    } else G.hud.setTimer(null);
    if (s.kind === 'steal') {
      if (G.player.inCar) this.advance();
    } else if (s.kind === 'goto') {
      const t = G.city.places[s.target];
      if (t && dist2d(G.player.x, G.player.z, t.x, t.z) < 9) this.advance();
    } else if (s.kind === 'fight') {
      if (this.thugsDown >= (s.count || 3)) this.advance();
    } else if (s.kind === 'escape') {
      if (G.wanted === 0) this.advance();
    }
  }
}
