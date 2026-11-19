// Neon Bay — all sound is synthesised with WebAudio, no audio files.
// Engine hum follows speed, the police siren swings two tones, and the
// bass loop keeps a synthwave pulse under everything. Mute is a single
// toggle that silences the master gain.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenHigh = false;
    this.sirenTimer = 0;
    this.bassTimer = 0;
    this.bassStep = 0;
    this.started = false;
  }

  // Must be called from a user gesture (the Start button).
  start() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // Engine: a low sawtooth whose pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.value = 50;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      // Siren: a triangle wave that swings between two notes.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = "triangle";
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.started = true;
    } catch (err) {
      // No audio device: the game plays on silently.
      this.started = false;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.value = m ? 0 : 0.5;
    }
  }

  // speed01: 0..1 (0 parked, 1 top speed). inCar silences the hum on foot.
  engine(speed01, inCar) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const target = inCar ? 0.05 + speed01 * 0.11 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(48 + speed01 * 130, t, 0.08);
  }

  // wanted > 0 brings the two-tone siren in; 0 fades it out.
  siren(wanted, dt) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const target = wanted > 0 ? 0.045 : 0.0;
    this.sirenGain.gain.setTargetAtTime(target, t, 0.2);
    if (wanted > 0) {
      this.sirenTimer += dt;
      if (this.sirenTimer > 0.42) {
        this.sirenTimer = 0;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(
          this.sirenHigh ? 920 : 700,
          t,
          0.05,
        );
      }
    }
  }

  // A short synthwave bass pulse, stepped on a timer.
  bass(dt) {
    if (!this.started) return;
    this.bassTimer += dt;
    if (this.bassTimer < 0.24) return;
    this.bassTimer = 0;
    const notes = [55, 55, 65.4, 49];
    const freq = notes[this.bassStep % notes.length];
    this.bassStep += 1;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  _blip(freq, dur, type, vol) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  _noise(dur, vol, lowpass) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = lowpass;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  gunshot() {
    this._noise(0.14, 0.5, 3200);
    this._blip(160, 0.08, "square", 0.25);
  }

  punch() {
    this._noise(0.09, 0.35, 900);
    this._blip(90, 0.07, "sine", 0.3);
  }

  crash() {
    this._noise(0.25, 0.4, 500);
  }

  cash() {
    this._blip(880, 0.09, "sine", 0.22);
    setTimeout(() => this._blip(1320, 0.14, "sine", 0.22), 90);
  }

  pickup() {
    this._blip(660, 0.08, "sine", 0.2);
    setTimeout(() => this._blip(990, 0.12, "sine", 0.2), 80);
  }

  busted() {
    this._blip(220, 0.3, "sawtooth", 0.2);
    setTimeout(() => this._blip(165, 0.45, "sawtooth", 0.2), 250);
  }

  // Bright three-note chime when a job pays out.
  missionComplete() {
    this._blip(523, 0.1, "sine", 0.22);
    setTimeout(() => this._blip(659, 0.1, "sine", 0.22), 100);
    setTimeout(() => this._blip(784, 0.18, "sine", 0.22), 200);
  }

  // Low descending sting when the player is wasted.
  wasted() {
    this._blip(330, 0.25, "sawtooth", 0.18);
    setTimeout(() => this._blip(247, 0.25, "sawtooth", 0.18), 220);
    setTimeout(() => this._blip(165, 0.5, "sawtooth", 0.18), 440);
  }
}
