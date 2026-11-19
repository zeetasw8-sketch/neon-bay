// Neon Bay — keyboard and mouse input.
// Keys are tracked by event.code (ShiftLeft, KeyW, ...) so the sprint
// check can never miss because of letter case. The queue can be wiped
// clean whenever the game shows a death screen or resumes, so a stale
// Escape pressed on the WASTED screen never pauses the game later.

export class Input {
  constructor() {
    this.down = new Set(); // codes currently held
    this.pressed = new Set(); // codes tapped since last frame
    this.dragDX = 0; // mouse drag accumulated this frame
    this.dragDY = 0;
    this.wheel = 0; // wheel steps accumulated this frame
    this.mouseDown = false;
    this.clicked = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this._onKeyDown = (e) => this._key(e, true);
    this._onKeyUp = (e) => this._key(e, false);
    this._onMouseDown = (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        // Do NOT fire on press: a drag orbits the camera and must not
        // shoot. The click is decided on release (see _onMouseUp).
        this.dragging = true;
        this._downX = e.clientX;
        this._downY = e.clientY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) {
        this.mouseDown = false;
        this.dragging = false;
        // A real click barely moves; a camera drag moves a lot.
        if (
          this._downX !== undefined &&
          Math.hypot(e.clientX - this._downX, e.clientY - this._downY) < 6
        ) {
          this.clicked = true;
        }
      }
    };
    this._onMouseMove = (e) => {
      if (!this.dragging) return;
      this.dragDX += e.clientX - this.lastX;
      this.dragDY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    this._onWheel = (e) => {
      this.wheel += Math.sign(e.deltaY);
    };
    this._onBlur = () => this.clear();
  }

  attach(el) {
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    el.addEventListener("mousedown", this._onMouseDown);
    window.addEventListener("mouseup", this._onMouseUp);
    window.addEventListener("mousemove", this._onMouseMove);
    el.addEventListener("wheel", this._onWheel, { passive: true });
    window.addEventListener("blur", this._onBlur);
  }

  _key(e, isDown) {
    // Keep the browser from scrolling or tabbing away mid-game.
    if (
      ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(
        e.code,
      )
    ) {
      e.preventDefault();
    }
    if (isDown) {
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    } else {
      this.down.delete(e.code);
    }
  }

  // Held right now?
  held(code) {
    return this.down.has(code);
  }

  // Tapped since the last endFrame()?
  tapped(code) {
    return this.pressed.has(code);
  }

  get sprint() {
    return this.down.has("ShiftLeft") || this.down.has("ShiftRight");
  }

  get forward() {
    return this.down.has("KeyW") || this.down.has("ArrowUp");
  }

  get back() {
    return this.down.has("KeyS") || this.down.has("ArrowDown");
  }

  get left() {
    return this.down.has("KeyA") || this.down.has("ArrowLeft");
  }

  get right() {
    return this.down.has("KeyD") || this.down.has("ArrowRight");
  }

  // Drop every held key and every tap. Called when the death screen
  // appears and when play resumes, so no stale key leaks through.
  clear() {
    this.down.clear();
    this.pressed.clear();
    this.dragDX = 0;
    this.dragDY = 0;
    this.wheel = 0;
    this.clicked = false;
  }

  // Call once per frame, after the game has read this frame's input.
  endFrame() {
    this.pressed.clear();
    this.dragDX = 0;
    this.dragDY = 0;
    this.wheel = 0;
    this.clicked = false;
  }
}
