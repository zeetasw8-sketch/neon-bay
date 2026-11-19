// Neon Bay — input: keyboard, mouse orbit, wheel zoom, klik tembak.
// Menyimpan tombol sebagai code DAN key sekaligus, supaya 'Shift' (key)
// dan 'ShiftLeft' (code) sama-sama dikenali — sprint tidak boleh mati
// karena beda nama tombol.
(function () {
  'use strict';

  var keys = new Set();        // tombol yang sedang ditahan (code + key)
  var justPressed = new Set(); // tombol yang baru ditekan sejak tick terakhir
  var shot = null;             // {x, y} klik tembak yang menunggu diproses
  var game = null;             // NBGame, dipasang main.js lewat attach()
  var drag = null;             // {x, y, moved} saat drag orbit kamera
  var canvas = null;

  var GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyR', 'KeyM',
    'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

  function isShift() {
    return keys.has('ShiftLeft') || keys.has('ShiftRight') ||
      keys.has('Shift') || keys.has('shift');
  }

  function onKeyDown(e) {
    if (GAME_KEYS.indexOf(e.code) >= 0 || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      e.preventDefault();
    }
    if (e.repeat) return;
    keys.add(e.code);
    keys.add(e.key);
    justPressed.add(e.code);
    justPressed.add(e.key);
  }

  function onKeyUp(e) {
    keys.delete(e.code);
    keys.delete(e.key);
  }

  function onPointerDown(e) {
    drag = { x: e.clientX, y: e.clientY, moved: false };
  }

  function onPointerMove(e) {
    if (!drag || !game) return;
    var dx = e.clientX - drag.x;
    var dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) {
      game.camYaw += dx * 0.005;
      game.camPitch = Math.max(0.08, Math.min(1.1, game.camPitch + dy * 0.003));
    }
    drag.x = e.clientX;
    drag.y = e.clientY;
  }

  function onPointerUp(e) {
    if (drag && !drag.moved && game && game.state === 'playing') {
      shot = { x: e.clientX, y: e.clientY };
    }
    drag = null;
  }

  function onWheel(e) {
    if (!game) return;
    e.preventDefault();
    var C = window.NB_CONFIG;
    game.camDist = Math.max(C.camMinDist, Math.min(C.camMaxDist, game.camDist + e.deltaY * 0.01));
  }

  function onBlur() {
    keys.clear();
    justPressed.clear();
    drag = null;
  }

  window.NBInput = {
    keys: keys,
    justPressed: justPressed,
    isShift: isShift,
    down: function (code) { return keys.has(code); },
    // Ambil dan kosongkan antrean tembakan (sekali pakai per klik).
    takeShot: function () { var s = shot; shot = null; return s; },
    // Dipanggil main.js tiap akhir tick supaya edge-trigger tidak dobel.
    endTick: function () { justPressed.clear(); },
    attach: function (g, cv) {
      game = g;
      canvas = cv;
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
      canvas.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('wheel', onWheel, { passive: false });
    },
  };
})();
