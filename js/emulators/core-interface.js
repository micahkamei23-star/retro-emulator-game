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

  start(onFrame) {
    if (this.isRunning) return;

    this.stop();
    this.isRunning = true;
    this._frameCounter = 0;

    const loop = () => {
      // Render safety: detect collapsed canvas
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
