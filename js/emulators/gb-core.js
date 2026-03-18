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
    this.canvas.width = 160;
    this.canvas.height = 144;
    this.ctx.imageSmoothingEnabled = false;

    this.gb = null;
    this.imageData = this.ctx.createImageData(160, 144);
    this.rgbaFrameLength = this.imageData.data.length;
    this.pixelFrameLength = 160 * 144;
    this.hasReceivedFrame = false;
  }

  copyFrameToImageData(frame) {
    if (!frame?.length) return;

    if (frame.length === this.rgbaFrameLength) {
      this.imageData.data.set(frame);
      return;
    }

    if (frame.length === this.pixelFrameLength * 3) {
      for (let src = 0, dst = 0; src < frame.length; src += 3, dst += 4) {
        this.imageData.data[dst] = frame[src];
        this.imageData.data[dst + 1] = frame[src + 1];
        this.imageData.data[dst + 2] = frame[src + 2];
        this.imageData.data[dst + 3] = 0xff;
      }
      return;
    }

    if (frame.length === this.pixelFrameLength) {
      for (let i = 0; i < frame.length; i += 1) {
        const src = frame[i];
        const dst = i * 4;

        // Handle both packed RGB and single-channel grayscale/indexed frames.
        if (src > 0xff) {
          this.imageData.data[dst] = (src >> 16) & 0xff;
          this.imageData.data[dst + 1] = (src >> 8) & 0xff;
          this.imageData.data[dst + 2] = src & 0xff;
        } else {
          const intensity = src <= 3 ? (3 - src) * 85 : src;
          this.imageData.data[dst] = intensity;
          this.imageData.data[dst + 1] = intensity;
          this.imageData.data[dst + 2] = intensity;
        }

        this.imageData.data[dst + 3] = 0xff;
      }
    }
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
        this.hasReceivedFrame = true;
        this.copyFrameToImageData(frame);

        if (frame?.length && frame.length !== this.rgbaFrameLength && frame.length !== this.pixelFrameLength && frame.length !== this.pixelFrameLength * 3) {
          console.warn('[GameBoy] Unexpected frame size:', frame.length);
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

    if (!this.hasReceivedFrame) {
      console.warn('[GameBoy] runFrame executed but onFrame has not produced a frame yet.');
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

  destroy() {
    super.destroy();
    this.gb = null;
    this.imageData = null;
    this.hasReceivedFrame = false;
  }
}
