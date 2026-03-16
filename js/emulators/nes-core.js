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
    this.canvas.width = 256;
    this.canvas.height = 240;
    console.log('[NESCore] canvas initialized', canvas.width, canvas.height);
    this.nes = null;
    // createImageData gives us a canvas-backed ImageData whose .data buffer we
    // can write to directly.  Using `new ImageData(uint8Array, w, h)` would
    // copy the array at construction time so later writes to the array would
    // never reach the ImageData – producing a permanently black screen.
    this.imageData = this.ctx.createImageData(256, 240);
    this.frameBuffer = this.imageData.data;
    this._frameCount = 0;
  }

  onFrame(frameBuffer24) {
    if (this._frameCount < 5) {
      console.log('[NESCore] Frame received');
      this._frameCount += 1;
    }
    for (let i = 0; i < frameBuffer24.length; i += 1) {
      const pixel = frameBuffer24[i];
      const idx = i * 4;
      this.frameBuffer[idx] = (pixel >> 16) & 0xff;
      this.frameBuffer[idx + 1] = (pixel >> 8) & 0xff;
      this.frameBuffer[idx + 2] = pixel & 0xff;
      this.frameBuffer[idx + 3] = 0xff;
    }
  }

  async init() {
    console.debug('JSNES global:', window.jsnes);
    console.debug('JSNES uppercase:', window.JSNES);

    let JSNESLib = this._resolveJSNES();

    if (!JSNESLib?.NES) {
      await loadScript('./cores/jsnes/jsnes.min.js');
      JSNESLib = this._resolveJSNES();
    }

    console.log('[NESCore] JSNES loaded', JSNESLib);
    if (!JSNESLib?.NES) {
      throw new Error('jsnes core is unavailable. Add cores/jsnes/jsnes.min.js or a CDN tag');
    }

    this.nes = new JSNESLib.NES({
      onFrame: this.onFrame.bind(this),
      onAudioSample: () => {},
    });
  }

  // Resolves the JSNES library namespace, normalizing the various ways CDNs
  // may expose the library. Checks window.jsnes first (lowercase), then
  // window.JSNES (uppercase). If the found value is already a namespace with a
  // .NES constructor, it is returned as-is. If it is the NES constructor
  // function itself (exported without a wrapping namespace), it is wrapped so
  // that callers can always use JSNESLib.NES uniformly.
  _resolveJSNES() {
    const raw = window.jsnes || window.JSNES;

    if (!raw) return null;
    if (raw.NES) return raw;
    if (typeof raw === 'function') return { NES: raw };
    return null;
  }

  async loadROM(romBuffer) {
    const bytes = romBuffer instanceof Uint8Array ? romBuffer : new Uint8Array(romBuffer);
    const binary = new TextDecoder('latin1').decode(bytes);
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
