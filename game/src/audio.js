// NEON BAY — all sound is synthesized with WebAudio. No audio files.
'use strict';
const NBAudio = {
  ctx: null, master: null, muted: false, engineOsc: null, engineGain: null,
  _musicTimer: null, _musicStep: 0,
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // Engine: sawtooth + lowpass, pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 50;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(filt); filt.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
    } catch (e) { /* audio unavailable — game still plays */ }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  },
  setEngine(speed01, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.07 : 0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(45 + speed01 * 130, t, 0.08);
  },
  _tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  _noise(dur, vol, freq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  },
  shoot() { this._noise(0.14, 0.5, 2600); this._tone(160, 0.1, 'square', 0.18, 60); },
  punch() { this._noise(0.08, 0.35, 700); },
  pickup() { this._tone(660, 0.12, 'sine', 0.25); setTimeout(() => this._tone(880, 0.16, 'sine', 0.25), 90); setTimeout(() => this._tone(1320, 0.2, 'sine', 0.22), 180); },
  cash() { this._tone(990, 0.1, 'triangle', 0.25); setTimeout(() => this._tone(1320, 0.22, 'triangle', 0.25), 100); },
  crash() { this._noise(0.3, 0.5, 500); this._tone(70, 0.25, 'sine', 0.4, 40); },
  siren(on) { // two-tone police siren loop handled by caller toggling
    if (!this.ctx) return;
    if (on && !this._sirenOsc) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 750; g.gain.value = 0.045;
      o.connect(g); g.connect(this.master); o.start();
      this._sirenOsc = o; this._sirenGain = g; this._sirenHi = true;
      this._sirenTimer = setInterval(() => {
        if (!this._sirenOsc) return;
        this._sirenHi = !this._sirenHi;
        this._sirenOsc.frequency.setTargetAtTime(this._sirenHi ? 950 : 650, this.ctx.currentTime, 0.05);
      }, 420);
    } else if (!on && this._sirenOsc) {
      clearInterval(this._sirenTimer);
      try { this._sirenOsc.stop(); } catch (e) {}
      this._sirenOsc = null;
    }
  },
  busted() { this._tone(440, 0.5, 'sawtooth', 0.2, 220); this._tone(330, 0.7, 'sawtooth', 0.2, 165); },
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 'triangle', 0.28), i * 110)); },
  startMusic() {
    if (!this.ctx || this._musicTimer) return;
    // Chill synthwave bassline loop, 100 BPM eighth notes.
    const bass = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 58.3, 0, 73.4, 0];
    const lead = [220, 0, 261.6, 0, 329.6, 0, 392, 0, 329.6, 0, 261.6, 0, 220, 0, 196, 0];
    this._musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const i = this._musicStep % 16;
      if (bass[i]) this._tone(bass[i], 0.28, 'sawtooth', 0.07);
      if (lead[i] && this._musicStep % 32 >= 16) this._tone(lead[i], 0.3, 'triangle', 0.05);
      this._musicStep++;
    }, 300);
  },
};
