// Neon Bay — synthesized sound (v5 rebuild). Everything is WebAudio: no
// audio files, no network. A quiet synthwave bass loop, an engine hum that
// follows speed, a two-tone police siren, and one-shot effects.

export const AudioSys = {
  ctx: null,
  muted: false,
  _engineOsc: null,
  _engineGain: null,
  _sirenOsc: null,
  _sirenGain: null,
  _musicTimer: null,
  _musicStep: 0,

  init() {
    // AudioContext must start from a user gesture; create it lazily and
    // resume it on the first interaction.
    const resume = () => { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
  },

  ensure() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this._startEngine();
      this._startMusic();
    } catch (e) { return false; }
    return !!this.ctx;
  },

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.ctx.suspend();
    if (!m && this.ctx) this.ctx.resume();
  },

  _startEngine() {
    const ctx = this.ctx;
    this._engineOsc = ctx.createOscillator();
    this._engineOsc.type = 'sawtooth';
    this._engineOsc.frequency.value = 55;
    this._engineGain = ctx.createGain();
    this._engineGain.gain.value = 0.0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    this._engineOsc.connect(lp); lp.connect(this._engineGain); this._engineGain.connect(ctx.destination);
    this._engineOsc.start();
  },

  setEngine(speed01) {
    if (!this.ctx || !this._engineOsc) return;
    const t = this.ctx.currentTime;
    this._engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.08);
    this._engineGain.gain.setTargetAtTime(this.muted ? 0 : 0.015 + speed01 * 0.05, t, 0.1);
  },

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this._sirenOsc) {
      const ctx = this.ctx;
      this._sirenOsc = ctx.createOscillator();
      this._sirenOsc.type = 'triangle';
      this._sirenOsc.frequency.value = 660;
      this._sirenGain = ctx.createGain();
      this._sirenGain.gain.value = 0.0;
      this._sirenOsc.connect(this._sirenGain); this._sirenGain.connect(ctx.destination);
      this._sirenOsc.start();
      this._sirenGain.gain.setTargetAtTime(this.muted ? 0 : 0.035, ctx.currentTime, 0.1);
      this._sirenAlt = setInterval(() => {
        if (!this._sirenOsc) return;
        this._sirenOsc.frequency.value = this._sirenOsc.frequency.value > 700 ? 520 : 880;
      }, 420);
    } else if (!on && this._sirenOsc) {
      clearInterval(this._sirenAlt);
      try { this._sirenOsc.stop(); } catch (e) {}
      this._sirenOsc = null;
      this._sirenGain = null;
    }
  },

  _blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  },

  _noise(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
    const g = ctx.createGain();
    g.gain.value = vol || 0.12;
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start();
  },

  gunshot() { this._noise(0.16, 0.22, 2600); this._blip(160, 0.1, 'square', 0.06, 60); },
  punch() { this._noise(0.09, 0.16, 500); this._blip(120, 0.08, 'sine', 0.12, 55); },
  crash() { this._noise(0.3, 0.2, 700); },
  cash() { this._blip(880, 0.12, 'sine', 0.09); setTimeout(() => this._blip(1318, 0.18, 'sine', 0.09), 90); },
  pickup() { this._blip(660, 0.1, 'sine', 0.08, 990); },
  missionDone() { [523, 659, 784].forEach((f, i) => setTimeout(() => this._blip(f, 0.16, 'sine', 0.09), i * 110)); },
  busted() { this._blip(440, 0.5, 'sawtooth', 0.08, 110); },

  _startMusic() {
    // Slow synthwave bass: A minor walk, one note per beat, quiet.
    const notes = [110, 110, 130.81, 98, 110, 110, 164.81, 146.83];
    this._musicTimer = setInterval(() => {
      if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
      const f = notes[this._musicStep % notes.length];
      this._musicStep++;
      this._blip(f, 0.5, 'triangle', 0.035);
      this._blip(f / 2, 0.5, 'sine', 0.03);
    }, 480);
  },
};
