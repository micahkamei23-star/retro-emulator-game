export class EmulatorCoreInterface {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.animationFrameId = null;
    this.isRunning = false;
    this.inputState = {};
  }

  async init() {}

  async loadROM(_romBuffer) {
    throw new Error('loadROM not implemented');
  }

  setInput(nextState) {
    this.inputState = { ...nextState };
  }

  start(onFrame) {
    if (this.isRunning) return;

    let frameCount = 0;
    const loop = () => {
      this.runFrame();
      if (onFrame) onFrame();
      frameCount += 1;
      if (frameCount <= 3) {
        console.log('Frame callback fired', frameCount);
      }
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.stop();
    this.isRunning = true;
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
