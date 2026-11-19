// Neon Bay — keyboard and mouse input.
// Keys are read by e.code (never e.key: Shift would turn 'w' into 'W').
// The input state is exposed read-only; the game consumes one-frame
// "pressed" edges, the menu consumes clicks, the camera consumes drags.

// readMoveInput returns the current WASD / arrow movement as { x, z }:
// +x east, +z south, already normalised (no diagonal speed boost).
function readMoveInput() {
  var x = 0, z = 0;
  if (held.KeyW || held.ArrowUp) z -= 1;
  if (held.KeyS || held.ArrowDown) z += 1;
  if (held.KeyA || held.ArrowLeft) x -= 1;
  if (held.KeyD || held.ArrowRight) x += 1;
  if (x !== 0 && z !== 0) { x *= 0.7071; z *= 0.7071; }
  return { x: x, z: z };
}

// isSprinting reports whether the run key (Shift) is held.
function isSprinting() {
  return !!held.ShiftLeft || !!held.ShiftRight;
}

// consumePressed returns true once for a key pressed this frame and
// clears the edge, so one physical press never fires twice.
function consumePressed(code) {
  if (pressed[code]) { pressed[code] = false; return true; }
  return false;
}

// wasClicked returns true once for a left mouse button press this frame.
function wasClicked() {
  if (clicked) { clicked = false; return true; }
  return false;
}

// getDrag returns the accumulated mouse-drag delta since the last call
// ({ dx, dy } in pixels) and zeroes the accumulator.
function getDrag() {
  var d = { dx: dragDX, dy: dragDY };
  dragDX = 0; dragDY = 0;
  return d;
}

// getWheel returns the accumulated mouse-wheel delta since the last call.
function getWheel() {
  var w = wheelDY;
  wheelDY = 0;
  return w;
}

// clearAll forgets every held key and edge (used on death and respawn so a
// key held through the death screen does not act on the fresh life).
function clearAll() {
  held = {}; pressed = {}; clicked = false; dragDX = 0; dragDY = 0;
}

var held = {};
var pressed = {};
var clicked = false;
var dragDX = 0, dragDY = 0, wheelDY = 0;
var dragging = false;

window.addEventListener('keydown', function (e) {
  if (!held[e.code]) pressed[e.code] = true; // edge on first press only
  held[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
});

window.addEventListener('keyup', function (e) { held[e.code] = false; });

window.addEventListener('mousedown', function (e) {
  if (e.button !== 0) return;
  clicked = true;
  dragging = true;
});

window.addEventListener('mouseup', function () { dragging = false; });

window.addEventListener('mousemove', function (e) {
  if (!dragging) return;
  dragDX += e.movementX || 0;
  dragDY += e.movementY || 0;
});

window.addEventListener('wheel', function (e) { wheelDY += e.deltaY || 0; });

window.addEventListener('blur', clearAll);

window.NBInput = {
  readMoveInput: readMoveInput,
  isSprinting: isSprinting,
  consumePressed: consumePressed,
  wasClicked: wasClicked,
  getDrag: getDrag,
  getWheel: getWheel,
  clearAll: clearAll,
  held: held
};
