import { EmulatorCoreInterface, uint8ToBase64, base64ToUint8 } from './core-interface.js';
import { loadScript } from './script-loader.js';
import { render } from '../render/renderer.js';

const SCREEN_WIDTH  = 256;
const SCREEN_HEIGHT = 240;

const BUTTON_MAP = {
  up:     4,
  down:   5,
  left:   6,
  right:  7,
  a:      0,
  b:      1,
  select: 2,
  start:  3,
};

export default class NESCore extends EmulatorCoreInterface {
  constructor(canvas) {
    super(canvas);
    /* Set logical canvas dimensions before start() applies DPR scaling */
    this.canvas.width  = SCREEN_WIDTH;
    this.canvas.height = SCREEN_HEIGHT;
    console.log('[NESCore] canvas initialized', SCREEN_WIDTH, SCREEN_HEIGHT);
    this.nes = null;

    /* Reusable RGBA buffer filled by the JSNES onFrame callback */
    this._frameBuffer = new Uint8ClampedArray(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
    this._frameCount  = 0;
  }

  onFrame(frameBuffer24) {
    if (this._frameCount < 5) {
      console.log('[NESCore] Frame received', frameBuffer24.length);
      this._frameCount += 1;
    }
    for (let i = 0; i < frameBuffer24.length; i += 1) {
      const pixel = frameBuffer24[i];
      const idx   = i * 4;
      this._frameBuffer[idx]     = (pixel >> 16) & 0xff;
      this._frameBuffer[idx + 1] = (pixel >> 8)  & 0xff;
      this._frameBuffer[idx + 2] =  pixel         & 0xff;
      this._frameBuffer[idx + 3] = 0xff;
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
      onFrame:       this.onFrame.bind(this),
      onAudioSample: () => {},
    });
    console.log('NES instance created');
  }

  /* Resolves the JSNES library namespace, normalizing the various ways CDNs
   * may expose the library. */
  _resolveJSNES() {
    const raw = window.jsnes || window.JSNES;
    if (!raw)          return null;
    if (raw.NES)       return raw;
    if (typeof raw === 'function') return { NES: raw };
    return null;
  }

  async loadROM(romBuffer) {
    const bytes = romBuffer instanceof Uint8Array ? romBuffer : new Uint8Array(romBuffer);
    /* A direct String.fromCharCode loop avoids the Windows-1252 code-page
     * corruption that TextDecoder('latin1') introduces for bytes 0x80-0x9F. */
    const chars = new Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      chars[i] = String.fromCharCode(bytes[i]);
    }
    const binary = chars.join('');
    console.log('Calling nes.loadROM', bytes.length, 'bytes');
    this.nes.loadROM(binary);
  }

  reset() {
    if (this.nes) this.nes.reset();
  }

  getFrameBuffer() {
    return this._frameBuffer;
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

    render(this.ctx, this._frameBuffer, SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  serializeState() {
    const save = this.nes.toJSON();
    return uint8ToBase64(new TextEncoder().encode(JSON.stringify(save)));
  }

  loadSerializedState(state) {
    const json = new TextDecoder().decode(base64ToUint8(state));
    this.nes.fromJSON(JSON.parse(json));
  }

  destroy() {
    super.destroy();
    this.nes          = null;
    this._frameBuffer = null;
  }
}
