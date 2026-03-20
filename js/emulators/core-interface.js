import { setupCanvas } from '../render/renderer.js';

/* ── iOS interaction gate ────────────────────────────────────────────────────
 * iOS Safari requires a user gesture (touch or click) before certain browser
 * APIs (AudioContext, canvas compositing) are usable.  We track the first
 * gesture globally so start() can defer the RAF loop when needed.
 */
let _userHasInteracted = false;

function _markInteraction() {
  _userHasInteracted = true;
}
document.addEventListener('touchstart', _markInteraction, { once: true, passive: true });
document.addEventListener('click',      _markInteraction, { once: true });

export class EmulatorCoreInterface {
  /** Enable to log frame-level diagnostics to the console. */
  static DEBUG_FRAMES = false;

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.animationFrameId = null;
    this.isRunning = false;
    this.inputState = {};
    this._frameCounter = 0;
  }

  async init() {}

  async loadROM(_romBuffer) {
    throw new Error('loadROM not implemented');
  }

  /** Reset the core to its initial state (after ROM load). */
  reset() {}

  /** Alias for runFrame — matches the CoreManager interface contract. */
  stepFrame() {
    this.runFrame();
  }

  /** Return the current RGBA framebuffer as a Uint8ClampedArray, or null. */
  getFrameBuffer() {
    return null;
  }

  /** Return the current audio sample buffer, or null. */
  getAudioBuffer() {
    return null;
  }

  setInput(nextState) {
    this.inputState = { ...nextState };
  }

  /**
   * Start the emulator render loop.
   *
   * Sets up the canvas for high-DPI rendering (devicePixelRatio) and creates
   * the shared offscreen canvas used by renderer.render().  On iOS the loop is
   * deferred until after the first user gesture so that the browser grants
   * access to relevant APIs.
   *
   * @param {Function} [onFrame] - Optional callback invoked after every frame.
   */
  start(onFrame) {
    if (this.isRunning) return;

    this.stop();
    this.isRunning = true;
    this._frameCounter = 0;

    /* Set up DPR-aware canvas using current logical dimensions.
     * canvas.width/height at this point hold the logical (game) resolution
     * set by the core's constructor. */
    const { ctx } = setupCanvas(this.canvas, this.canvas.width, this.canvas.height);
    this.ctx = ctx;

    const beginLoop = () => {
      const loop = () => {
        /* Render safety: detect collapsed canvas */
        if (this.canvas.width < 1 || this.canvas.height < 1) {
          console.warn('[RenderSafety] Canvas size is 0 — skipping frame');
        } else {
          this.runFrame();
        }

        if (onFrame) onFrame();
        this._frameCounter += 1;

        if (EmulatorCoreInterface.DEBUG_FRAMES && this._frameCounter <= 5) {
          console.log('[FrameDebug] frame', this._frameCounter);
        }

        this.animationFrameId = requestAnimationFrame(loop);
      };

      this.animationFrameId = requestAnimationFrame(loop);
      console.log('Frame loop started');
      console.log('Core started');
    };

    if (_userHasInteracted) {
      /* Desktop / already-interacted: start immediately */
      beginLoop();
    } else {
      /* iOS fix: defer loop start until the first touch or click */
      const startOnInteraction = () => {
        document.removeEventListener('touchstart', startOnInteraction);
        document.removeEventListener('click',      startOnInteraction);
        if (this.isRunning) beginLoop();
      };
      document.addEventListener('touchstart', startOnInteraction, { once: true, passive: true });
      document.addEventListener('click',      startOnInteraction, { once: true });
      console.log('Core waiting for user interaction (iOS fix)');
    }
  }

  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.isRunning) {
      this.isRunning = false;
      console.log('Frame loop stopped');
      console.log('Core stopped');
    }
  }

  runFrame() {}

  serializeState() {
    return null;
  }

  loadSerializedState(_state) {}

  destroy() {
    this.stop();
    this.inputState = {};
    this._frameCounter = 0;
  }
}

export function uint8ToBase64(uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    binary += String.fromCharCode(...uint8Array.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToUint8(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
