// Neon Bay — keyboard + mouse input (v5 rebuild).
// Keys are stored twice: by e.code (KeyW, ShiftLeft) and by the lowercased
// e.key (w, shift). Sprint checks the lowercased 'shift', which is the D4
// fix: the browser reports the modifier as 'Shift' with a capital S, so a
// check for the lowercase name alone used to miss it.

export const Input = {
  down: new Set(), // currently held keys
  pressed: new Set(), // keys pressed since the last tick (edges)
  dragDX: 0, // accumulated horizontal mouse drag since the last tick
  dragDY: 0,
  wheelDelta: 0, // accumulated wheel since the last tick
  clicked: false, // a real click (down+up, barely moved) since last tick
  dragging: false,

  _downPos: null,
  _downTime: 0,
  _moved: 0,

  init() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = (e.key || '').toLowerCase();
      this.down.add(e.code);
      if (k) this.down.add(k);
      this.pressed.add(e.code);
      if (k) this.pressed.add(k);
      // Keep game keys from scrolling the page.
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = (e.key || '').toLowerCase();
      this.down.delete(e.code);
      if (k) this.down.delete(k);
    });
    window.addEventListener('blur', () => this.clear());
    window.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this._downPos = { x: e.clientX, y: e.clientY };
      this._downTime = performance.now();
      this._moved = 0;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      this.dragDX += dx;
      this.dragDY += dy;
      this._moved += Math.abs(dx) + Math.abs(dy);
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this.dragging) return;
      this.dragging = false;
      // A click is a press that barely moved: dragging to look must not
      // fire the pistol.
      if (this._moved < 6 && performance.now() - this._downTime < 600) this.clicked = true;
      this._downPos = null;
    });
    window.addEventListener('wheel', (e) => { this.wheelDelta += e.deltaY; }, { passive: true });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  isDown(name) {
    return this.down.has(name);
  },

  // True once for the frame in which the key went down.
  wasPressed(name) {
    return this.pressed.has(name);
  },

  // End of tick: forget edges and per-frame mouse deltas.
  endTick() {
    this.pressed.clear();
    this.dragDX = 0;
    this.dragDY = 0;
    this.wheelDelta = 0;
    this.clicked = false;
  },

  // Hard reset: used when the death screen appears and on resume, so a
  // stale Escape or movement key can never leak into the next state.
  clear() {
    this.down.clear();
    this.pressed.clear();
    this.dragDX = 0;
    this.dragDY = 0;
    this.wheelDelta = 0;
    this.clicked = false;
    this.dragging = false;
  },
};
