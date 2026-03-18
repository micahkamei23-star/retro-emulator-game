class Controller {
  constructor(onInput = () => {}) {
    this.onInput = onInput;
    this.state = new Map();
    this.controlElements = new Map();
    this.touchToControl = new Map();
    this.activeTouchCountByControl = new Map();
    this.pointerToControl = new Map();

    this.bindTouchControls();
    this.bindKeyboardControls();
    this.bindGamepadPolling();
  }

  emit(control, pressed, source) {
    if (this.state.get(control) === pressed) return;
    this.state.set(control, pressed);
    this.onInput({ control, pressed, source });
  }

  vibrate(duration = 12) {
    if (navigator.vibrate) navigator.vibrate(duration);
  }

  setPressedVisual(control, pressed) {
    const elements = this.controlElements.get(control) || [];
    elements.forEach((element) => {
      element.classList.toggle('is-pressed', pressed);
    });
  }

  updateControlTouchCount(control, delta) {
    const previous = this.activeTouchCountByControl.get(control) || 0;
    const next = Math.max(0, previous + delta);

    if (next === 0) {
      this.activeTouchCountByControl.delete(control);
      this.setPressedVisual(control, false);
      this.emit(control, false, 'touch');
      return;
    }

    this.activeTouchCountByControl.set(control, next);
    if (previous === 0) {
      this.setPressedVisual(control, true);
      this.emit(control, true, 'touch');
    }
  }

  getControlFromElement(element) {
    const button = element?.closest?.('[data-control]');
    return button?.dataset?.control || null;
  }

  getControlFromTouchPoint(touch) {
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    return this.getControlFromElement(target);
  }

  assignTouchToControl(touchId, control, { vibrate = false } = {}) {
    const previousControl = this.touchToControl.get(touchId);
    if (previousControl === control) return;

    if (previousControl) {
      this.updateControlTouchCount(previousControl, -1);
      this.touchToControl.delete(touchId);
    }

    if (!control) return;

    this.touchToControl.set(touchId, control);
    this.updateControlTouchCount(control, 1);
    if (vibrate) this.vibrate();
  }

  releaseTouch(touchId) {
    const control = this.touchToControl.get(touchId);
    if (!control) return;

    this.touchToControl.delete(touchId);
    this.updateControlTouchCount(control, -1);
  }

  bindTouchControls() {
    const buttons = document.querySelectorAll('[data-control]');

    buttons.forEach((button) => {
      const control = button.dataset.control;
      const existing = this.controlElements.get(control) || [];
      this.controlElements.set(control, [...existing, button]);

      button.addEventListener('contextmenu', (event) => event.preventDefault());
      button.addEventListener('touchstart', (event) => {
        event.preventDefault();
        for (const touch of event.changedTouches) {
          this.assignTouchToControl(touch.identifier, control, { vibrate: true });
        }
      }, { passive: false });

      button.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'touch') return;
        event.preventDefault();
        this.pointerToControl.set(event.pointerId, control);
        this.setPressedVisual(control, true);
        this.emit(control, true, 'pointer');
      }, { passive: false });

      const releasePointer = (event) => {
        if (event.pointerType === 'touch') return;
        event.preventDefault();
        const mapped = this.pointerToControl.get(event.pointerId);
        if (!mapped) return;

        this.pointerToControl.delete(event.pointerId);
        this.setPressedVisual(mapped, false);
        this.emit(mapped, false, 'pointer');
      };

      button.addEventListener('pointerup', releasePointer, { passive: false });
      button.addEventListener('pointercancel', releasePointer, { passive: false });
      button.addEventListener('pointerleave', releasePointer, { passive: false });
    });

    document.addEventListener('touchstart', (event) => {
      // Only prevent default when at least one touch lands on a game-control
      // element.  Preventing it unconditionally swallows the synthesised click
      // that iOS Safari generates for the "Upload ROM" label, so the file
      // picker never opens.
      let touchedControl = false;
      for (const touch of event.changedTouches) {
        const control = this.getControlFromTouchPoint(touch);
        if (control) touchedControl = true;
        this.assignTouchToControl(touch.identifier, control, { vibrate: Boolean(control) });
      }
      if (touchedControl) event.preventDefault();
    }, { passive: false });

    document.addEventListener('touchmove', (event) => {
      if (!this.touchToControl.size) return;
      event.preventDefault();
      for (const touch of event.changedTouches) {
        const nextControl = this.getControlFromTouchPoint(touch);
        this.assignTouchToControl(touch.identifier, nextControl);
      }
    }, { passive: false });

    const endTouch = (event) => {
      if (!this.touchToControl.size) return;
      event.preventDefault();
      for (const touch of event.changedTouches) {
        this.releaseTouch(touch.identifier);
      }
    };

    document.addEventListener('touchend', endTouch, { passive: false });
    document.addEventListener('touchcancel', endTouch, { passive: false });
  }

  bindKeyboardControls() {
    const keyMap = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      z: 'a',
      x: 'b',
      a: 'x',
      s: 'y',
      Enter: 'start',
      Shift: 'select',
    };

    window.addEventListener('keydown', (event) => {
      const control = keyMap[event.key] || keyMap[event.key.toLowerCase?.()];
      if (!control) return;
      event.preventDefault();
      this.emit(control, true, 'keyboard');
    });

    window.addEventListener('keyup', (event) => {
      const control = keyMap[event.key] || keyMap[event.key.toLowerCase?.()];
      if (!control) return;
      event.preventDefault();
      this.emit(control, false, 'keyboard');
    });
  }

  bindGamepadPolling() {
    // Standard gamepad button mapping
    // https://w3c.github.io/gamepad/#remapping
    const buttonMap = [
      /* 0 */ 'a',
      /* 1 */ 'b',
      /* 2 */ 'x',
      /* 3 */ 'y',
      /* 4 */ null, // L bumper
      /* 5 */ null, // R bumper
      /* 6 */ null, // L trigger
      /* 7 */ null, // R trigger
      /* 8 */ 'select',
      /* 9 */ 'start',
      /* 10 */ null, // L stick
      /* 11 */ null, // R stick
      /* 12 */ 'up',
      /* 13 */ 'down',
      /* 14 */ 'left',
      /* 15 */ 'right',
    ];

    const poll = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = Array.prototype.find.call(gamepads, (gp) => gp !== null);
      if (pad) {
        // Axis-based d-pad
        const left = pad.axes[0] < -0.4;
        const right = pad.axes[0] > 0.4;
        const up = pad.axes[1] < -0.4;
        const down = pad.axes[1] > 0.4;

        [
          { control: 'left', pressed: left },
          { control: 'right', pressed: right },
          { control: 'up', pressed: up },
          { control: 'down', pressed: down },
        ].forEach(({ control, pressed }) => this.emit(control, pressed, 'gamepad'));

        // Button-based mapping
        for (let i = 0; i < pad.buttons.length && i < buttonMap.length; i += 1) {
          const control = buttonMap[i];
          if (!control) continue;
          const pressed = pad.buttons[i].pressed;
          this.emit(control, pressed, 'gamepad');
        }
      }
      requestAnimationFrame(poll);
    };

    // Start polling only when a gamepad is detected
    window.addEventListener('gamepadconnected', () => {
      console.log('[Controller] Gamepad connected');
    });
    window.addEventListener('gamepaddisconnected', () => {
      console.log('[Controller] Gamepad disconnected');
    });

    poll();
  }
}

export default Controller;
