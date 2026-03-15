import { EmulatorCoreInterface, uint8ToBase64, base64ToUint8 } from './core-interface.js';
import { loadScript } from './script-loader.js';

const BUTTON_MAP = {
  up: 4,
  down: 5,
  left: 6,
  right: 7,
  a: 0,
  b: 1,
  select: 2,
  start: 3,
};

export default class NESCore extends EmulatorCoreInterface {
  constructor(canvas) {
    super(canvas);
    this.nes = null;
    this.frameBuffer = new Uint8ClampedArray(256 * 240 * 4);
    this.imageData = new ImageData(this.frameBuffer, 256, 240);
  }

  async init() {
    await loadScript('./cores/jsnes/jsnes.min.js');
    const JSNES = window.jsnes || window.JSNES;
    if (!JSNES?.NES) {
      throw new Error('jsnes core is unavailable. Add cores/jsnes/jsnes.min.js');
    }

    this.nes = new JSNES.NES({
      onFrame: (frameBuffer24) => {
        for (let i = 0; i < frameBuffer24.length; i += 1) {
          const pixel = frameBuffer24[i];
          const idx = i * 4;
          this.frameBuffer[idx] = (pixel >> 16) & 0xff;
          this.frameBuffer[idx + 1] = (pixel >> 8) & 0xff;
          this.frameBuffer[idx + 2] = pixel & 0xff;
          this.frameBuffer[idx + 3] = 0xff;
        }
      },
      onAudioSample: () => {},
    });
  }

  async loadROM(romBuffer) {
    const binary = new TextDecoder('latin1').decode(new Uint8Array(romBuffer));
    this.nes.loadROM(binary);
  }

  runFrame() {
    Object.entries(BUTTON_MAP).forEach(([button, buttonId]) => {
      if (this.inputState[button]) {
        this.nes.buttonDown(1, buttonId);
      } else {
        this.nes.buttonUp(1, buttonId);
      }
    });

    this.nes.frame();
    this.ctx.putImageData(this.imageData, 0, 0);
  }

  serializeState() {
    const save = this.nes.toJSON();
    return uint8ToBase64(new TextEncoder().encode(JSON.stringify(save)));
  }

  loadSerializedState(state) {
    const json = new TextDecoder().decode(base64ToUint8(state));
    this.nes.fromJSON(JSON.parse(json));
  }
}
