// Neon Bay — audio: semua bunyi disintesis WebAudio, tanpa file audio.
// Mesin mengikuti kecepatan, sirene dua nada, tembakan, pukulan, uang,
// dan loop bass synthwave. Semua dibungkus try/catch: di headless
// AudioContext boleh tertunda tanpa merusak game.
(function () {
  'use strict';

  var ctx = null;
  var master = null;
  var muted = false;
  var engineOsc = null;
  var engineGain = null;
  var sirenTimer = 0;
  var sirenHigh = false;
  var musicTimer = null;
  var musicStep = 0;
  var started = false;

  function ensure() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      // Mesin: osilator gigi gergaji pelan, nadanya mengikuti kecepatan.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      engineOsc.connect(lp);
      lp.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      return true;
    } catch (e) {
      ctx = null;
      return false;
    }
  }

  function tone(freq, dur, type, vol, when) {
    if (!ctx || muted) return;
    try {
      var t = ctx.currentTime + (when || 0);
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (e) { /* abaikan */ }
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    try {
      var len = Math.floor(ctx.sampleRate * dur);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq || 1200;
      var g = ctx.createGain();
      g.gain.value = vol || 0.3;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start();
    } catch (e) { /* abaikan */ }
  }

  // Bassline synthwave: A minor, 8 langkah, diputar tiap 0.24 dtk.
  var BASS = [55, 0, 55, 65.41, 55, 0, 49, 58.27];
  function musicTick() {
    if (!ctx || muted) return;
    var f = BASS[musicStep % BASS.length];
    musicStep++;
    if (f > 0) tone(f, 0.22, 'triangle', 0.12);
    if (musicStep % 8 === 0) tone(220, 0.3, 'sine', 0.04);
  }

  window.NBAudio = {
    start: function () {
      if (started) return;
      started = true;
      if (!ensure()) return;
      try {
        if (ctx.state === 'suspended') ctx.resume();
        if (!musicTimer) musicTimer = setInterval(musicTick, 240);
      } catch (e) { /* abaikan */ }
    },
    setMuted: function (m) {
      muted = !!m;
      if (master) { try { master.gain.value = muted ? 0 : 0.35; } catch (e) {} }
      return muted;
    },
    isMuted: function () { return muted; },
    // Dipanggil tiap tick: nada mesin mengikuti kecepatan, sirene saat wanted.
    update: function (speed, wanted, dt) {
      if (!ctx || muted) return;
      try {
        if (engineOsc) {
          engineOsc.frequency.value = 50 + Math.abs(speed) * 4.2;
          engineGain.gain.value = Math.min(0.09, 0.02 + Math.abs(speed) * 0.002);
        }
        if (wanted > 0) {
          sirenTimer -= dt;
          if (sirenTimer <= 0) {
            sirenTimer = 0.42;
            sirenHigh = !sirenHigh;
            tone(sirenHigh ? 880 : 660, 0.4, 'sine', 0.05);
          }
        }
      } catch (e) { /* abaikan */ }
    },
    gunshot: function () { noise(0.16, 0.5, 2600); tone(160, 0.1, 'square', 0.12); },
    punch: function () { noise(0.09, 0.35, 500); tone(90, 0.09, 'sine', 0.25); },
    crash: function () { noise(0.25, 0.4, 900); },
    cash: function () { tone(880, 0.12, 'sine', 0.18); tone(1174, 0.12, 'sine', 0.18, 0.09); tone(1568, 0.2, 'sine', 0.2, 0.18); },
    pickup: function () { tone(660, 0.1, 'sine', 0.15); tone(990, 0.14, 'sine', 0.15, 0.08); },
    missionDone: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.2, i * 0.11); }); },
    busted: function () { tone(392, 0.25, 'sawtooth', 0.15); tone(311, 0.4, 'sawtooth', 0.15, 0.22); },
    wasted: function () { tone(220, 0.4, 'sawtooth', 0.15); tone(165, 0.7, 'sawtooth', 0.15, 0.3); },
  };
})();
