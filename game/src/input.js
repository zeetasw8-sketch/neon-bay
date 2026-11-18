// NEON BAY — keyboard + mouse input state.
'use strict';
const NBInput = {
  keys: {},
  pressed: {}, // edge-triggered: set on keydown, consumed once by the game tick
  mouseDown: false,
  mouseDX: 0, mouseDY: 0,   // accumulated drag deltas, consumed by camera
  dragging: false,
  _lastX: 0, _lastY: 0,
  init(canvas) {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (!e.repeat) this.pressed[e.code] = true; // tap-safe: never missed between frames
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.mouseDown = false; this.dragging = false; });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true; this.dragging = true; this._lastX = e.clientX; this._lastY = e.clientY;
      if (window.NBGame && window.NBGame.state === 'playing') window.NBGame.onMouseDown();
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.mouseDX += e.clientX - this._lastX;
      this.mouseDY += e.clientY - this._lastY;
      this._lastX = e.clientX; this._lastY = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => {
      if (window.NBGame) window.NBGame.onWheel(e.deltaY);
    }, { passive: true });
  },
  down(code) { return !!this.keys[code]; },
  // Returns true once per physical key press, then clears it.
  consume(code) {
    if (this.pressed[code]) { this.pressed[code] = false; return true; }
    return false;
  },
  axis() { // WASD / arrows as -1..1
    let x = 0, z = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) z -= 1; // forward = -z in camera space
    if (this.down('KeyS') || this.down('ArrowDown')) z += 1;
    return { x, z };
  },
  consumeMouse() { const d = { x: this.mouseDX, y: this.mouseDY }; this.mouseDX = 0; this.mouseDY = 0; return d; },
};
