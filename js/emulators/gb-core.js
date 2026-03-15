import { EmulatorCoreInterface, uint8ToBase64, base64ToUint8 } from './core-interface.js';
import { loadScript } from './script-loader.js';

const BUTTON_MAP = {
  up: 'UP',
  down: 'DOWN',
  left: 'LEFT',
  right: 'RIGHT',
  a: 'A',
  b: 'B',
  select: 'SELECT',
  start: 'START',
};

export default class GameBoyCore extends EmulatorCoreInterface {
  constructor(canvas) {
    super(canvas);
    this.gb = null;
    this.imageData = this.ctx.createImageData(160, 144);
  }

  async init() {
    await loadScript('./cores/gameboy/gameboy.min.js');
    const GameBoyJS = window.GameBoyJS || window.GameBoyEmulator || window.GameBoyCore;
    if (!GameBoyJS) {
      throw new Error('GameBoy.js core is unavailable. Add cores/gameboy/gameboy.min.js');
    }

    this.gb = new GameBoyJS({
      canvas: this.canvas,
      audio: false,
      onFrame: (frame) => {
        if (frame?.length === this.imageData.data.length) {
          this.imageData.data.set(frame);
        }
      },
    });
  }

  async loadROM(romBuffer) {
    if (this.gb.loadROM) {
      this.gb.loadROM(new Uint8Array(romBuffer));
    } else if (this.gb.load) {
      this.gb.load(new Uint8Array(romBuffer));
    } else {
      throw new Error('GameBoy.js ROM loading method not found');
    }
  }

  runFrame() {
    Object.entries(BUTTON_MAP).forEach(([button, mapped]) => {
      const pressed = Boolean(this.inputState[button]);
      if (this.gb.setButtonState) {
        this.gb.setButtonState(mapped, pressed);
      }
    });

    if (this.gb.runFrame) {
      this.gb.runFrame();
    } else if (this.gb.step) {
      this.gb.step();
    }

    this.ctx.putImageData(this.imageData, 0, 0);
  }

  serializeState() {
    if (!this.gb.saveState) return null;
    return uint8ToBase64(this.gb.saveState());
  }

  loadSerializedState(state) {
    if (!this.gb.loadState) return;
    this.gb.loadState(base64ToUint8(state));
  }
}
