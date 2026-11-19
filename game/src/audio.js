// Neon Bay — sound, synthesised live with WebAudio. No audio files.
// Everything is built from oscillators and noise buffers so the game has
// no downloads and no licensed music. The context is created lazily on
// the first user gesture, so it never blocks page load.

// initAudio creates the shared AudioContext on first use.
function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(ctx.destination);
  } catch (e) { ctx = null; }
}

// resumeAudio wakes the context after a user gesture (browsers start
// suspended). Called from the menu click and from every key press.
function resumeAudio() {
  initAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

// tone plays a short oscillator blip. `type` is the waveform ('sine',
// 'square', 'sawtooth', 'triangle'), `freq` the start pitch, `slideTo`
// the end pitch (0 = no slide), `dur` the length in seconds, `vol` 0..1.
function tone(type, freq, slideTo, dur, vol) {
  if (!ctx || muted) return;
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), ctx.currentTime + dur);
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g); g.connect(master);
  o.start(); o.stop(ctx.currentTime + dur);
}

// noise plays a burst of filtered white noise for `dur` seconds.
function noise(dur, vol, cutoff) {
  if (!ctx || muted) return;
  var len = Math.floor(ctx.sampleRate * dur);
  var buf = ctx.createBuffer(1, len, ctx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = buf;
  f.type = 'lowpass'; f.frequency.value = cutoff || 900;
  g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master);
  src.start();
}

// startEngine begins the looping engine drone (two detuned saws through a
// lowpass). It is silent until the player drives; setEngine drives it.
function startEngine() {
  initAudio();
  if (!ctx || engineOsc) return;
  engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
  engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'sawtooth'; engineOsc2.frequency.value = 83;
  engineGain = ctx.createGain(); engineGain.gain.value = 0;
  engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 320;
  engineOsc.connect(engineFilter); engineOsc2.connect(engineFilter);
  engineFilter.connect(engineGain); engineGain.connect(master);
  engineOsc.start(); engineOsc2.start();
}

// setEngine sets the engine drone pitch and loudness from speed (0..1).
function setEngine(speed01) {
  if (!engineOsc || !ctx) return;
  var t = ctx.currentTime;
  engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, t, 0.08);
  engineOsc2.frequency.setTargetAtTime(78 + speed01 * 190, t, 0.08);
  engineGain.gain.setTargetAtTime(0.02 + speed01 * 0.06, t, 0.1);
}

// stopEngine silences the engine drone.
function stopEngine() {
  if (engineGain && ctx) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
}

// playSiren plays the two-tone police siren.
function playSiren() { tone('sine', 620, 940, 0.45, 0.1); }

// playGunshot plays a sharp crack.
function playGunshot() { noise(0.16, 0.5, 2600); }

// playPunch plays a dull thud.
function playPunch() { noise(0.09, 0.35, 500); tone('sine', 140, 60, 0.09, 0.25); }

// playCrash plays a metallic bang.
function playCrash() { noise(0.35, 0.45, 750); tone('square', 110, 45, 0.3, 0.2); }

// playCash plays the cash-register chime on a mission payout.
function playCash() { tone('sine', 880, 0, 0.12, 0.22); setTimeout(function () { tone('sine', 1318, 0, 0.22, 0.22); }, 110); }

// playMission plays the mission-complete jingle (four rising notes).
function playMission() {
  var notes = [523, 659, 784, 1046];
  for (var i = 0; i < notes.length; i++) {
    (function (f, delay) {
      setTimeout(function () { tone('sine', f, 0, 0.22, 0.22); }, delay);
    })(notes[i], i * 110);
  }
}

// playWasted plays the low death sting.
function playWasted() { tone('sawtooth', 220, 55, 0.9, 0.25); }

// playBusted plays the descending "caught" sting.
function playBusted() { tone('square', 330, 110, 0.7, 0.2); }

// startMusic begins the quiet synthwave bass loop (dusk ambience).
function startMusic() {
  initAudio();
  if (!ctx || musicTimer) return;
  var bass = [55, 55, 65.4, 49, 55, 55, 73.4, 82.4];
  var step = 0;
  musicTimer = setInterval(function () {
    if (muted || !ctx) return;
    tone('triangle', bass[step % bass.length], 0, 0.42, 0.05);
    step++;
  }, 430);
}

// stopMusic silences the bass loop.
function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

// setMuted toggles all sound on or off.
function setMuted(m) {
  muted = !!m;
  if (master && ctx) master.gain.value = muted ? 0 : 0.35;
}

// isMuted reports the current mute state.
function isMuted() { return muted; }

var ctx = null, master = null, muted = false;
var engineOsc = null, engineOsc2 = null, engineGain = null, engineFilter = null;
var musicTimer = null;

window.NBAudio = {
  initAudio: initAudio, resumeAudio: resumeAudio,
  startEngine: startEngine, setEngine: setEngine, stopEngine: stopEngine,
  playSiren: playSiren, playGunshot: playGunshot, playPunch: playPunch,
  playCrash: playCrash, playCash: playCash, playMission: playMission,
  playWasted: playWasted, playBusted: playBusted,
  startMusic: startMusic, stopMusic: stopMusic,
  setMuted: setMuted, isMuted: isMuted
};
