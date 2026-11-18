// PALMIRA BAY — all sound is synthesised live with WebAudio: no audio files.
// Engine hum, two-tone siren, gunshots, punches, pickups, mission jingles and
// three tiny radio stations (a bassline sequencer per station, keys 1-3).
export const STATIONS = [
  { name: 'RADIO SOL — Latin Groove', bpm: 96, bass: [45, 0, 45, 0, 48, 0, 43, 0, 45, 0, 50, 0, 48, 45, 0, 43], lead: [69, 72, 76, 72] },
  { name: 'PALM FM — Sunset Synth', bpm: 112, bass: [41, 41, 0, 41, 46, 0, 44, 0, 41, 41, 0, 48, 46, 44, 43, 0], lead: [64, 67, 71, 74, 71, 67] },
  { name: 'BAY 88 — Street Bass', bpm: 128, bass: [38, 0, 38, 38, 0, 41, 0, 38, 36, 0, 38, 0, 43, 0, 41, 38], lead: [62, 65, 62, 69] },
];
export class AudioSys {
  constructor() {
    this.ctx = null; this.muted = false; this.station = 0;
    this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenOn = false;
    this.musicOn = true; this.nextNote = 0; this.step = 0; this.beat = 0;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const g = this.ctx.createGain(); g.gain.value = 0.5; g.connect(this.ctx.destination);
      this.master = g;
      this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 50;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      const filt = this.ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 420;
      this.engineOsc.connect(filt); filt.connect(this.engineGain); this.engineGain.connect(g);
      this.engineOsc.start();
      this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(g);
      this.sirenOsc.start();
    } catch { this.ctx = null; }
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }
  setEngine(amount, on) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.03 + amount * 0.06 : 0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(48 + amount * 130, t, 0.1);
  }
  setSiren(on) {
    this.sirenOn = on;
    if (!this.ctx || !this.sirenGain) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }
  sirenTick(time) {
    if (!this.ctx || !this.sirenOsc || !this.sirenOn) return;
    this.sirenOsc.frequency.setTargetAtTime(Math.sin(time * 5) > 0 ? 760 : 580, this.ctx.currentTime, 0.05);
  }
  blip(freq, dur, type = 'sine', vol = 0.2) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  }
  noise(dur, vol = 0.3, freq = 1200) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  }
  shoot() { this.noise(0.14, 0.4, 2400); this.blip(160, 0.08, 'square', 0.18); }
  punch() { this.noise(0.09, 0.3, 500); }
  crash() { this.noise(0.25, 0.35, 700); }
  pickup() { this.blip(660, 0.09); setTimeout(() => this.blip(990, 0.14), 90); }
  coin() { this.blip(880, 0.08); setTimeout(() => this.blip(1320, 0.16), 80); }
  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.22), i * 110));
  }
  fail() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'sawtooth', 0.12), i * 140)); }
  // Tiny sequenced radio: one bass note + one sparkle note per 16th step.
  musicTick(dt) {
    if (!this.ctx || this.muted || !this.musicOn) return;
    const st = STATIONS[this.station];
    const stepDur = 60 / st.bpm / 4;
    this.beat += dt;
    while (this.beat >= stepDur) {
      this.beat -= stepDur;
      const s = this.step % 16;
      const bass = st.bass[s];
      if (bass) this.note(bass, stepDur * 0.95, 'triangle', 0.14);
      if (s % 4 === 0) this.note(st.lead[(this.step / 4 | 0) % st.lead.length] + 12, stepDur * 1.8, 'sine', 0.05);
      if (s === 0 || s === 8) this.noise(0.03, 0.05, 6000);
      this.step++;
    }
  }
  note(midi, dur, type, vol) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  }
  cycleStation() {
    this.station = (this.station + 1) % STATIONS.length;
    return STATIONS[this.station].name;
  }
}
