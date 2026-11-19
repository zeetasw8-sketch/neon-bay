// Neon Bay — input keyboard + mouse (v3, ditulis dari nol).
// Satu aturan penting (perbaikan v2): antrean tombol DIBERSIHKAN setiap kali
// state game berubah (mati, jeda, kembali bermain), supaya tombol Escape yang
// ditekan di layar kematian tidak meledak belakangan.

// Kantong tombol hybrid Map+Set: alat tes boleh keys.set('w', true) atau keys.add('w').
class KeyBag {
  constructor() { this._m = new Map(); }
  set(k, v) { this._m.set(k, v === undefined ? true : v); return this; }
  get(k) { return this._m.get(k); }
  has(k) { return !!this._m.get(k); }
  delete(k) { return this._m.delete(k); }
  add(k) { this._m.set(k, true); return this; }
  clear() { this._m.clear(); }
}

export class Input {
  constructor() {
    this.keys = new KeyBag();
    this.pressed = new Set();   // tombol yang baru ditekan frame ini
    this._phys = new Set();     // tombol fisik yang sedang ditahan (keyboard asli)
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.clicked = false;       // klik kiri baru frame ini
    this.wheel = 0;
    this.dragging = false;
    this._onKeyDown = (e) => this._key(e, true);
    this._onKeyUp = (e) => this._key(e, false);
    this._onMouseDown = (e) => {
      if (e.button === 0) { this.mouseDown = true; this.clicked = true; }
      this.dragging = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
      this.dragging = false;
    };
    this._onMouseMove = (e) => {
      if (!this.dragging) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };
    this._onWheel = (e) => { this.wheel += e.deltaY; };
    this._onBlur = () => this.clear();
    this._onContext = (e) => e.preventDefault();
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('wheel', this._onWheel);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('contextmenu', this._onContext);
  }

  detach() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('contextmenu', this._onContext);
  }

  _key(e, down) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
    }
    if (down) {
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.set(k, true);
      this._phys.add(k);
    } else {
      this.keys.delete(k);
      this._phys.delete(k);
    }
  }

  down(code) { return this.keys.has(code); }
  // Sekali pakai: tombol fisik via pressed; tombol injeksi terpakai sekali lalu hilang.
  hit(code) {
    if (this.pressed.has(code)) return true;
    if (this.keys.has(code) && !this._phys.has(code)) { this.keys.delete(code); return true; }
    return false;
  }

  // Sumbu gerak -1..1 dari WASD / panah. Depan = W (maju).
  moveX() {
    let x = 0;
    if (this.down('a') || this.down('ArrowLeft')) x -= 1;
    if (this.down('d') || this.down('ArrowRight')) x += 1;
    return x;
  }
  moveY() {
    let y = 0;
    if (this.down('w') || this.down('ArrowUp')) y += 1;
    if (this.down('s') || this.down('ArrowDown')) y -= 1;
    return y;
  }
  // D4: tombol Shift disimpan _key() apa adanya ('Shift', huruf besar) —
  // sprint harus mengecek ejaan itu (dulu 'shift' kecil: tidak pernah true).
  sprint() { return this.down('Shift') || this.down('shift'); }
  handbrake() { return this.down(' '); }

  // Dipanggil tiap akhir frame oleh loop utama.
  endFrame() {
    this.pressed.clear();
    this.clicked = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  // Pembersihan total — dipanggil pada setiap pergantian state
  // (masuk jeda, keluar jeda, mati, respawn, ganti misi).
  clear() {
    this.keys.clear();
    this.pressed.clear();
    this._phys.clear();
    this.clicked = false;
    this.mouseDown = false;
    this.dragging = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
