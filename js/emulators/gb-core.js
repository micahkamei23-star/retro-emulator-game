import { EmulatorCoreInterface, uint8ToBase64, base64ToUint8 } from './core-interface.js';
import { loadScript } from './script-loader.js';
import { render } from '../render/renderer.js';

const SCREEN_WIDTH  = 160;
const SCREEN_HEIGHT = 144;

const BUTTON_MAP = {
  up:     'UP',
  down:   'DOWN',
  left:   'LEFT',
  right:  'RIGHT',
  a:      'A',
  b:      'B',
  select: 'SELECT',
  start:  'START',
};

export default class GameBoyCore extends EmulatorCoreInterface {
  constructor(canvas) {
    super(canvas);
    /* Set logical canvas dimensions before start() applies DPR scaling */
    this.canvas.width  = SCREEN_WIDTH;
    this.canvas.height = SCREEN_HEIGHT;
    this.ctx.imageSmoothingEnabled = false;

    this.gb = null;
    /* Reusable RGBA buffer — avoids per-frame ImageData allocation */
    this._frameBuffer     = new Uint8ClampedArray(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
    this._pixelFrameLen   = SCREEN_WIDTH * SCREEN_HEIGHT;
    this.hasReceivedFrame = false;
  }

  copyFrameToBuffer(frame) {
    if (!frame?.length) return;
    const dst = this._frameBuffer;

    if (frame.length === dst.length) {
      dst.set(frame);
      return;
    }

    if (frame.length === this._pixelFrameLen * 3) {
      for (let src = 0, d = 0; src < frame.length; src += 3, d += 4) {
        dst[d]     = frame[src];
        dst[d + 1] = frame[src + 1];
        dst[d + 2] = frame[src + 2];
        dst[d + 3] = 0xff;
      }
      return;
    }

    if (frame.length === this._pixelFrameLen) {
      for (let i = 0; i < frame.length; i += 1) {
        const src = frame[i];
        const d   = i * 4;
        if (src > 0xff) {
          dst[d]     = (src >> 16) & 0xff;
          dst[d + 1] = (src >> 8)  & 0xff;
          dst[d + 2] =  src        & 0xff;
        } else {
          const intensity = src <= 3 ? (3 - src) * 85 : src;
          dst[d]     = intensity;
          dst[d + 1] = intensity;
          dst[d + 2] = intensity;
        }
        dst[d + 3] = 0xff;
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
      canvas:  this.canvas,
      audio:   false,
      onFrame: (frame) => {
        this.hasReceivedFrame = true;
        this.copyFrameToBuffer(frame);

        if (frame?.length &&
            frame.length !== this._frameBuffer.length &&
            frame.length !== this._pixelFrameLen &&
            frame.length !== this._pixelFrameLen * 3) {
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

  getFrameBuffer() {
    return this._frameBuffer;
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

    render(this.ctx, this._frameBuffer, SCREEN_WIDTH, SCREEN_HEIGHT);
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
    this.gb               = null;
    this._frameBuffer     = null;
    this.hasReceivedFrame = false;
  }
}
