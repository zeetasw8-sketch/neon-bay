// Neon Bay — semua suara disintesis WebAudio, tanpa file audio (v3, dari nol).
// Mesin mengikuti kecepatan, sirene dua nada, tembakan, pukulan, tabrakan,
// bunyi uang, dan loop bass synthwave. Dibuat setelah gestur pertama user.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.musicOn = false;
    this._engineLevel = 0;
    this.bassNotes = [55, 55, 65.41, 49, 55, 55, 73.42, 65.41];
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // Mesin: osilator gigi gergaji -> lowpass -> gain kecil.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    // Sirene: osilator sinus yang frekuensinya diganti dua nada.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0.0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.ctx.destination);
    this.sirenOsc.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.engineGain) this.engineGain.gain.value = m ? 0 : (this._engineLevel || 0);
    if (this.sirenGain) this.sirenGain.gain.value = 0;
  }

  _noiseBurst(dur, freq, vol, type = 'lowpass') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.ctx.destination);
    src.start(t);
  }

  _blip(freq, dur, vol, type = 'sine', when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  gunshot() { this._noiseBurst(0.14, 1800, 0.5, 'highpass'); this._blip(120, 0.1, 0.4, 'square'); }
  punch() { this._noiseBurst(0.09, 500, 0.45); }
  crash() { this._noiseBurst(0.25, 300, 0.5); }
  pickup() { this._blip(880, 0.12, 0.25); this._blip(1318, 0.18, 0.25, 'sine', 0.09); }
  cash() { this._blip(1046, 0.1, 0.22); this._blip(1568, 0.22, 0.22, 'sine', 0.08); }
  fail() { this._blip(220, 0.3, 0.25, 'sawtooth'); this._blip(165, 0.4, 0.25, 'sawtooth', 0.15); }
  busted() { this._blip(392, 0.2, 0.25, 'square'); this._blip(311, 0.35, 0.25, 'square', 0.18); }

  // Dipanggil tiap tick dari loop utama.
  update(dt, speed01, policeNear, inCar) {
    if (!this.ctx) return;
    this._engineLevel = inCar ? 0.05 + 0.05 * speed01 : 0.0;
    if (!this.muted && this.engineGain) {
      this.engineGain.gain.value = this._engineLevel;
      this.engineOsc.frequency.value = 55 + 140 * speed01;
    }
    // Sirene dua nada, ganti tiap 0.35 detik bila polisi dekat.
    this.sirenTimer += dt;
    if (policeNear && !this.muted) {
      if (this.sirenTimer > 0.35) {
        this.sirenTimer = 0;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.value = this.sirenHigh ? 920 : 700;
      }
      this.sirenGain.gain.value = 0.035;
    } else if (this.sirenGain) {
      this.sirenGain.gain.value = 0;
    }
    // Loop bass synthwave: satu not per 0.42 detik.
    if (this.musicOn && !this.muted) {
      this.musicTimer += dt;
      if (this.musicTimer > 0.42) {
        this.musicTimer = 0;
        const f = this.bassNotes[this.musicStep % this.bassNotes.length];
        this.musicStep++;
        this._blip(f, 0.38, 0.11, 'triangle');
        if (this.musicStep % 4 === 0) this._blip(f * 2, 0.12, 0.05, 'sine');
      }
    }
  }

  startMusic() { this.musicOn = true; }
  stopMusic() { this.musicOn = false; }
}
