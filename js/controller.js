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

  bindTouchControls() {
    const buttons = document.querySelectorAll('[data-control]');
    buttons.forEach((button) => {
      const control = button.dataset.control;

      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        this.emit(control, true, 'touch');
      });

      const release = (event) => {
        event.preventDefault();
        this.emit(control, false, 'touch');
      };

      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', release);
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
