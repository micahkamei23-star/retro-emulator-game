class Controller {
  constructor(onInput = () => {}) {
    this.onInput = onInput;
    this.state = new Map();
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

  bindTouchControls() {
    const buttons = document.querySelectorAll('[data-control]');

    buttons.forEach((button) => {
      const control = button.dataset.control;
      let pressedByTouch = false;
      let pressedByPointer = false;

      const setPressed = (pressed, source) => {
        if (pressed) {
          button.classList.add('is-pressed');
          this.emit(control, true, source);
        } else {
          button.classList.remove('is-pressed');
          this.emit(control, false, source);
        }
      };

      const pressTouch = (event) => {
        event.preventDefault();
        if (pressedByTouch) return;
        pressedByTouch = true;
        this.vibrate();
        setPressed(true, 'touch');
      };

      const releaseTouch = (event) => {
        event.preventDefault();
        if (!pressedByTouch) return;
        pressedByTouch = false;
        setPressed(false, 'touch');
      };

      const pressPointer = (event) => {
        event.preventDefault();
        if (pressedByPointer || event.pointerType === 'touch') return;
        pressedByPointer = true;
        setPressed(true, 'pointer');
      };

      const releasePointer = (event) => {
        event.preventDefault();
        if (!pressedByPointer || event.pointerType === 'touch') return;
        pressedByPointer = false;
        setPressed(false, 'pointer');
      };

      button.addEventListener('touchstart', pressTouch, { passive: false });
      button.addEventListener('touchend', releaseTouch, { passive: false });
      button.addEventListener('touchcancel', releaseTouch, { passive: false });
      button.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });

      button.addEventListener('pointerdown', pressPointer, { passive: false });
      button.addEventListener('pointerup', releasePointer, { passive: false });
      button.addEventListener('pointercancel', releasePointer, { passive: false });
      button.addEventListener('pointerleave', releasePointer, { passive: false });

      const press = (event) => {
        event.preventDefault();
        button.classList.add('is-pressed');
        this.emit(control, true, 'touch');
      };

      const release = (event) => {
        event.preventDefault();
        button.classList.remove('is-pressed');
        this.emit(control, false, 'touch');
      };

      button.addEventListener('touchstart', press, { passive: false });
      button.addEventListener('touchend', release, { passive: false });
      button.addEventListener('touchcancel', release, { passive: false });
      button.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });

      button.addEventListener('pointerdown', press);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', release);
      button.addEventListener('contextmenu', (event) => event.preventDefault());
    });
  }

  bindKeyboardControls() {
    const keyMap = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      z: 'a', x: 'b', a: 'x', s: 'y', Enter: 'start', Shift: 'select',
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
    const poll = () => {
      const [pad] = navigator.getGamepads ? navigator.getGamepads() : [];
      if (pad) {
        const left = pad.axes[0] < -0.4;
        const right = pad.axes[0] > 0.4;
        const up = pad.axes[1] < -0.4;
        const down = pad.axes[1] > 0.4;

        [{ control: 'left', pressed: left }, { control: 'right', pressed: right },
          { control: 'up', pressed: up }, { control: 'down', pressed: down }]
          .forEach(({ control, pressed }) => this.emit(control, pressed, 'gamepad'));
      }
      requestAnimationFrame(poll);
    };

    poll();
  }
}

export default Controller;
