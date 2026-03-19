/**
 * skin-engine.js — Strict device-skin rendering system
 *
 * ARCHITECTURE:
 *  - Device skin is a PNG/SVG image; all buttons are visually baked in.
 *  - HTML elements are ONLY invisible hitboxes — never visible controls.
 *  - Canvas is positioned exactly inside the screen cutout.
 *  - Input is held-state (pointerdown/up/cancel), sent every animation frame.
 *  - DPAD detects direction by quadrant of touch position within its hitbox.
 *  - Fullscreen ONLY scales #emulator — canvas is NEVER recreated.
 */

/* ── Skin config ─────────────────────────────────────────────── */
/* ALL values are normalized (0–1) relative to #device dimensions */
export const skins = {
  gameboy: {
    image: '/skins/gameboy.svg',
    screen: {
      left:   0.12,
      top:    0.18,
      width:  0.76,
      height: 0.52,
    },
    hitboxes: {
      A:      { x: 0.82, y: 0.72, size: 0.12 },
      B:      { x: 0.72, y: 0.80, size: 0.12 },
      START:  { x: 0.50, y: 0.92, size: 0.10 },
      SELECT: { x: 0.40, y: 0.92, size: 0.10 },
      DPAD:   { x: 0.20, y: 0.75, size: 0.20 },
    },
  },

  gba: {
    image: '/skins/gba.svg',
    screen: {
      left:   0.10,
      top:    0.20,
      width:  0.80,
      height: 0.40,
    },
    hitboxes: {
      A:      { x: 0.82, y: 0.70, size: 0.12 },
      B:      { x: 0.73, y: 0.78, size: 0.12 },
      L:      { x: 0.08, y: 0.08, size: 0.14 },
      R:      { x: 0.92, y: 0.08, size: 0.14 },
      START:  { x: 0.55, y: 0.88, size: 0.10 },
      SELECT: { x: 0.45, y: 0.88, size: 0.10 },
      DPAD:   { x: 0.18, y: 0.72, size: 0.20 },
    },
  },

  psp: {
    image: '/skins/psp.svg',
    screen: {
      left:   0.08,
      top:    0.12,
      width:  0.84,
      height: 0.50,
    },
    hitboxes: {
      A:      { x: 0.84, y: 0.75, size: 0.12 },
      B:      { x: 0.76, y: 0.82, size: 0.12 },
      START:  { x: 0.58, y: 0.92, size: 0.10 },
      SELECT: { x: 0.42, y: 0.92, size: 0.10 },
      DPAD:   { x: 0.16, y: 0.75, size: 0.20 },
    },
  },
};

/* ── DOM refs ─────────────────────────────────────────────────── */
const deviceSkin  = document.getElementById('device-skin');
const screen      = document.getElementById('screen');
const hitboxLayer = document.getElementById('hitbox-layer');
const emulator    = document.getElementById('emulator');

/* ── Input state: HOLD-based, not click-based ─────────────────── */
const inputState = {
  RIGHT:  false,
  LEFT:   false,
  UP:     false,
  DOWN:   false,
  A:      false,
  B:      false,
  SELECT: false,
  START:  false,
  L:      false,
  R:      false,
};

/* Bit positions matching standard joypad bitmask convention */
const InputBits = {
  RIGHT:  0,
  LEFT:   1,
  UP:     2,
  DOWN:   3,
  A:      4,
  B:      5,
  SELECT: 6,
  START:  7,
};

/* Returns bitmask for cores that accept numeric input */
export function getInputMask() {
  let mask = 0;
  for (const [key, bit] of Object.entries(InputBits)) {
    if (inputState[key]) mask |= (1 << bit);
  }
  return mask;
}

/* Returns object for cores that accept {up,down,...} style input */
export function getInputObject() {
  return {
    up:     inputState.UP,
    down:   inputState.DOWN,
    left:   inputState.LEFT,
    right:  inputState.RIGHT,
    a:      inputState.A,
    b:      inputState.B,
    start:  inputState.START,
    select: inputState.SELECT,
  };
}

/* ── DPAD quadrant detection ──────────────────────────────────── */
function clearDpad() {
  inputState.UP    = false;
  inputState.DOWN  = false;
  inputState.LEFT  = false;
  inputState.RIGHT = false;
}

function updateDpad(el, ev) {
  const r  = el.getBoundingClientRect();
  const cx = ev.clientX - r.left;
  const cy = ev.clientY - r.top;
  const nx = cx / r.width;
  const ny = cy / r.height;
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  clearDpad();
  /* Strongest axis wins — classic 4-way directional */
  if (Math.abs(dx) > Math.abs(dy)) {
    inputState.RIGHT = dx > 0;
    inputState.LEFT  = dx < 0;
  } else {
    inputState.DOWN = dy > 0;
    inputState.UP   = dy < 0;
  }
}

function attachDpadHandler(el) {
  el.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    el.setPointerCapture(ev.pointerId);
    updateDpad(el, ev);
  }, { passive: false });

  el.addEventListener('pointermove', (ev) => {
    if (!ev.buttons) return;
    ev.preventDefault();
    updateDpad(el, ev);
  }, { passive: false });

  el.addEventListener('pointerup',     (ev) => { ev.preventDefault(); clearDpad(); }, { passive: false });
  el.addEventListener('pointercancel', (ev) => { ev.preventDefault(); clearDpad(); }, { passive: false });
}

/* ── Hitbox factory (Step 4 of render pipeline) ───────────────── */
function createHitboxes(skin) {
  for (const [name, cfg] of Object.entries(skin.hitboxes)) {
    const el = document.createElement('div');
    el.className        = 'hitbox';
    el.dataset.button   = name;
    el.style.left       = (cfg.x    * 100) + '%';
    el.style.top        = (cfg.y    * 100) + '%';
    el.style.width      = (cfg.size * 100) + '%';
    el.style.height     = (cfg.size * 100) + '%';
    el.style.transform  = 'translate(-50%, -50%)';

    if (name === 'DPAD') {
      attachDpadHandler(el);
    } else {
      /* Hold-state: set true on pointerdown, false on pointerup/cancel */
      el.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        el.setPointerCapture(ev.pointerId);
        inputState[name] = true;
      }, { passive: false });

      el.addEventListener('pointerup', (ev) => {
        ev.preventDefault();
        inputState[name] = false;
      }, { passive: false });

      el.addEventListener('pointercancel', (ev) => {
        ev.preventDefault();
        inputState[name] = false;
      }, { passive: false });
    }

    hitboxLayer.appendChild(el);
  }
}

/* ── Render pipeline ──────────────────────────────────────────── */
let currentSkinName = null;

export function applySkin(name) {
  const skin = skins[name];
  if (!skin) {
    console.error('[skin-engine] applySkin: skin not found:', name);
    return;
  }

  /* Step 1: Set image source */
  deviceSkin.src = skin.image;

  /* Step 2: Position screen EXACTLY inside cutout (percentage of #device) */
  screen.style.left   = (skin.screen.left   * 100) + '%';
  screen.style.top    = (skin.screen.top    * 100) + '%';
  screen.style.width  = (skin.screen.width  * 100) + '%';
  screen.style.height = (skin.screen.height * 100) + '%';

  /* Step 3: Clear all hitboxes */
  hitboxLayer.innerHTML = '';

  /* Step 4: Create hitboxes from config */
  createHitboxes(skin);

  currentSkinName = name;
  console.log('[skin-engine] skin applied:', name);
}

export function getSkinNames() {
  return Object.keys(skins);
}

export function getCurrentSkinName() {
  return currentSkinName;
}

export function nextSkin() {
  const names = getSkinNames();
  const idx   = names.indexOf(currentSkinName);
  applySkin(names[(idx + 1) % names.length]);
}

export function prevSkin() {
  const names = getSkinNames();
  const idx   = names.indexOf(currentSkinName);
  applySkin(names[(idx - 1 + names.length) % names.length]);
}

/* ── Core connection ──────────────────────────────────────────── */
let core = null;

export function setCore(c) {
  core = c;
}

/* Detect which input method the core exposes */
function findInputMethod() {
  if (!core) return null;
  if (typeof core.setKeys  === 'function') return 'setKeys';
  if (typeof core.setInput === 'function') return 'setInput';
  if (typeof core.joypadSet === 'function') return 'joypadSet';
  return null;
}

/* ── Frame loop: input sent EVERY frame (not once on event) ────── */
let rafId = null;

function loop() {
  if (core) {
    try {
      const method = findInputMethod();
      if (method === 'setKeys' || method === 'joypadSet') {
        core[method](getInputMask());
      } else if (method === 'setInput') {
        /* Some cores take object, some take bitmask — try object first */
        core.setInput(getInputObject());
      }
    } catch (e) {
      /* Swallow — core may not be ready yet */
    }
  }
  rafId = requestAnimationFrame(loop);
}

export function startLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

export function stopLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

/* ── Fullscreen: ONLY scales #emulator, NEVER recreates canvas ── */
export async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await emulator.requestFullscreen({ navigationUI: 'hide' });
    } else {
      await document.exitFullscreen();
    }
  } catch (e) {
    console.warn('[skin-engine] toggleFullscreen:', e.message);
  }
}

/* ── Keyboard input (desktop support) ────────────────────────── */
const KEY_MAP = {
  ArrowUp:    'UP',
  ArrowDown:  'DOWN',
  ArrowLeft:  'LEFT',
  ArrowRight: 'RIGHT',
  z:          'A',
  Z:          'A',
  x:          'B',
  X:          'B',
  Enter:      'START',
  ShiftRight: 'SELECT',
  ShiftLeft:  'SELECT',
};

document.addEventListener('keydown', (e) => {
  const btn = KEY_MAP[e.key] || KEY_MAP[e.code];
  if (btn) {
    e.preventDefault();
    inputState[btn] = true;
  }
});

document.addEventListener('keyup', (e) => {
  const btn = KEY_MAP[e.key] || KEY_MAP[e.code];
  if (btn) {
    e.preventDefault();
    inputState[btn] = false;
  }
});

/* ── Prevent mobile double-tap zoom & page scroll ─────────────── */
let lastTouchTime = 0;
document.addEventListener('touchstart', (e) => {
  const now = Date.now();
  if (now - lastTouchTime < 300) e.preventDefault();
  lastTouchTime = now;
}, { passive: false });

document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

/* ── Auto-init: apply first skin and start loop ───────────────── */
applySkin(getSkinNames()[0]);
startLoop();
