// Neon Bay — the three.js bridge.
// The vendored three.min.js is a UMD build: index.html loads it as a
// classic script, which sets window.THREE. This tiny module hands that
// global to the game's ES modules as an import, so no module needs to
// reach for the global directly.
export const THREE = window.THREE;
