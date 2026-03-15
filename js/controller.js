class Controller {
  constructor(onInput = () => {}) {
    this.onInput = onInput;
    this.state = new Map();
    this.bindTouchControls();
    this.bindKeyboardControls();
    this.bindGamepadPolling();
  }

  bindTouchControls() {
    const buttons = document.querySelectorAll('[data-control]');
    buttons.forEach((button) => {
      const control = button.dataset.control;
      const press = (pressed) => {
        this.state.set(control, pressed);
        this.onInput({ control, pressed, source: 'touch' });
      };
      button.addEventListener('touchstart', (event) => {
        event.preventDefault();
        press(true);
      }, { passive: false });
      button.addEventListener('touchend', (event) => {
        event.preventDefault();
        press(false);
      }, { passive: false });
      button.addEventListener('mousedown', () => press(true));
      button.addEventListener('mouseup', () => press(false));
      button.addEventListener('mouseleave', () => press(false));
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
      this.state.set(control, true);
      this.onInput({ control, pressed: true, source: 'keyboard' });
    });
    window.addEventListener('keyup', (event) => {
      const control = keyMap[event.key] || keyMap[event.key.toLowerCase?.()];
      if (!control) return;
      this.state.set(control, false);
      this.onInput({ control, pressed: false, source: 'keyboard' });
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
          .forEach(({ control, pressed }) => {
            if (this.state.get(control) !== pressed) {
              this.state.set(control, pressed);
              this.onInput({ control, pressed, source: 'gamepad' });
            }
          });
      }
      requestAnimationFrame(poll);
    };
    poll();
  }
}

export default Controller;
