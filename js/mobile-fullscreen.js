/**
 * Mobile Fullscreen Module
 * Handles fullscreen mode, orientation lock, touch lockdown,
 * joystick input, and control overlay for mobile devices.
 *
 * Does NOT modify emulator core, rendering pipeline, or controller API.
 * Only translates joystick gestures → existing directional inputs via controller.emit().
 */

const DEADZONE = 18;
const JOYSTICK_MAX_RADIUS = 48;
const ANGLE_HYSTERESIS = 12 * (Math.PI / 180); // ~12 degrees

const DIRECTION_ANGLES = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2,
};

export default class MobileFullscreen {
  constructor({ controller, onExit }) {
    this.controller = controller;
    this.onExit = onExit;
    this.active = false;
    this.overlayVisible = true;

    // Joystick state
    this.joystickOrigin = null;
    this.joystickTouchId = null;
    this.currentDirections = { up: false, down: false, left: false, right: false };

    // Cache DOM refs
    this.overlay = document.getElementById('mobileControlOverlay');
    this.joystickZone = document.getElementById('joystickZone');
    this.joystickThumb = document.getElementById('joystickThumb');
    this.joystickBase = document.getElementById('joystickBase');
    this.btnA = document.getElementById('mobileBtn-a');
    this.btnB = document.getElementById('mobileBtn-b');
    this.btnStart = document.getElementById('mobileBtn-start');
    this.btnSelect = document.getElementById('mobileBtn-select');
    this.exitBtn = document.getElementById('mobileExitBtn');

    this._bindJoystick();
    this._bindActionButtons();
    this._bindExitButton();
    this._bindOverlayToggle();
  }

  // ── Public API ─────────────────────────────────────────────

  async enter() {
    this.active = true;
    this.overlayVisible = true;
    document.body.classList.add('mobile-fullscreen');
    this.overlay.hidden = false;
    this.overlay.classList.remove('controls-hidden');

    // Ensure canvas is visible and has correct resolution
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
      canvas.style.display = 'block';
      canvas.style.opacity = '1';
      // Ensure internal resolution is explicitly set (not just CSS-scaled)
      if (!canvas.width || canvas.width < 2) canvas.width = 256;
      if (!canvas.height || canvas.height < 2) canvas.height = 240;
    }

    // Fullscreen
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      } catch { /* user gesture required */ }
    }

    // Orientation lock
    try {
      const orientation = screen.orientation || screen.mozOrientation || screen.msOrientation;
      if (orientation?.lock) await orientation.lock('landscape');
    } catch { /* unsupported or requires fullscreen first */ }

    this._blockGestures(true);
  }

  exit() {
    this.active = false;
    document.body.classList.remove('mobile-fullscreen');
    this.overlay.hidden = true;
    this._resetJoystick();
    this._blockGestures(false);

    // Unlock orientation
    try {
      const orientation = screen.orientation || screen.mozOrientation || screen.msOrientation;
      if (orientation?.unlock) orientation.unlock();
    } catch { /* ignore */ }
  }

  // ── Gesture blocking ──────────────────────────────────────

  _blockGestures(enable) {
    if (enable) {
      this._gestureHandler = (e) => {
        if (this.active) e.preventDefault();
      };
      document.addEventListener('touchmove', this._gestureHandler, { passive: false });
      document.addEventListener('gesturestart', this._gestureHandler, { passive: false });
      document.addEventListener('gesturechange', this._gestureHandler, { passive: false });
    } else if (this._gestureHandler) {
      document.removeEventListener('touchmove', this._gestureHandler);
      document.removeEventListener('gesturestart', this._gestureHandler);
      document.removeEventListener('gesturechange', this._gestureHandler);
      this._gestureHandler = null;
    }
  }

  // ── Overlay toggle (tap canvas) ───────────────────────────

  _bindOverlayToggle() {
    const canvas = document.getElementById('gameCanvas');
    canvas.addEventListener('touchend', (e) => {
      if (!this.active) return;
      // Only toggle if it's a short tap on canvas (not joystick area)
      e.stopPropagation();
      this.overlayVisible = !this.overlayVisible;
      this.overlay.classList.toggle('controls-hidden', !this.overlayVisible);
    }, { passive: true });
  }

  // ── Exit button ────────────────────────────────────────────

  _bindExitButton() {
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.onExit) this.onExit();
    };
    this.exitBtn.addEventListener('touchstart', handler, { passive: false });
    this.exitBtn.addEventListener('click', handler);
  }

  // ── Action buttons (A, B, Start, Select) ───────────────────

  _bindActionButtons() {
    const buttons = [
      { el: this.btnA, control: 'a' },
      { el: this.btnB, control: 'b' },
      { el: this.btnStart, control: 'start' },
      { el: this.btnSelect, control: 'select' },
    ];

    const activeTouches = new Map();

    buttons.forEach(({ el, control }) => {
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        for (const touch of e.changedTouches) {
          activeTouches.set(touch.identifier, control);
        }
        el.classList.add('is-pressed');
        this.controller.emit(control, true, 'touch');
        // Haptic feedback on button press
        if (navigator.vibrate) {
          navigator.vibrate(12);
        }
      }, { passive: false });

      el.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        let stillPressed = false;
        for (const touch of e.changedTouches) {
          activeTouches.delete(touch.identifier);
        }
        // Check if any remaining touch is on this control
        for (const [, c] of activeTouches) {
          if (c === control) { stillPressed = true; break; }
        }
        if (!stillPressed) {
          el.classList.remove('is-pressed');
          this.controller.emit(control, false, 'touch');
        }
      }, { passive: false });

      el.addEventListener('touchcancel', (e) => {
        for (const touch of e.changedTouches) {
          activeTouches.delete(touch.identifier);
        }
        el.classList.remove('is-pressed');
        this.controller.emit(control, false, 'touch');
      }, { passive: false });
    });
  }

  // ── Joystick ───────────────────────────────────────────────

  _bindJoystick() {
    this.joystickZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.joystickTouchId !== null) return; // already tracking

      const touch = e.changedTouches[0];
      this.joystickTouchId = touch.identifier;
      this.joystickOrigin = { x: touch.clientX, y: touch.clientY };
      this.joystickThumb.style.transition = 'none';
      this.joystickThumb.style.transform = 'translate(0px, 0px)';
    }, { passive: false });

    this.joystickZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (const touch of e.changedTouches) {
        if (touch.identifier !== this.joystickTouchId) continue;
        this._processJoystickMove(touch);
      }
    }, { passive: false });

    const endJoystick = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier !== this.joystickTouchId) continue;
        e.preventDefault();
        this._resetJoystick();
      }
    };

    this.joystickZone.addEventListener('touchend', endJoystick, { passive: false });
    this.joystickZone.addEventListener('touchcancel', endJoystick, { passive: false });
  }

  _processJoystickMove(touch) {
    if (!this.joystickOrigin) return;

    const dx = touch.clientX - this.joystickOrigin.x;
    const dy = touch.clientY - this.joystickOrigin.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Clamp visual position
    const clampedDist = Math.min(distance, JOYSTICK_MAX_RADIUS);
    const angle = Math.atan2(dy, dx);
    const visualX = Math.cos(angle) * clampedDist;
    const visualY = Math.sin(angle) * clampedDist;
    this.joystickThumb.style.transform = `translate(${visualX}px, ${visualY}px)`;

    // Deadzone check
    if (distance < DEADZONE) {
      this._setDirections({ up: false, down: false, left: false, right: false });
      return;
    }

    // Convert angle to 4-way direction (strongest axis)
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    let newDirs = { up: false, down: false, left: false, right: false };

    if (absX > absY) {
      // Horizontal dominant
      newDirs[dx > 0 ? 'right' : 'left'] = true;
    } else {
      // Vertical dominant
      newDirs[dy > 0 ? 'down' : 'up'] = true;
    }

    this._setDirections(newDirs);
  }

  _setDirections(newDirs) {
    for (const dir of ['up', 'down', 'left', 'right']) {
      if (newDirs[dir] !== this.currentDirections[dir]) {
        this.currentDirections[dir] = newDirs[dir];
        this.controller.emit(dir, newDirs[dir], 'touch');
      }
    }
  }

  _resetJoystick() {
    this.joystickTouchId = null;
    this.joystickOrigin = null;
    this.joystickThumb.style.transition = 'transform 0.15s ease-out';
    this.joystickThumb.style.transform = 'translate(0px, 0px)';
    this._setDirections({ up: false, down: false, left: false, right: false });
  }
}
