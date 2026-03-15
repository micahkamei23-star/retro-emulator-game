export class EmulatorCoreInterface {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.animationFrameId = null;
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
    const loop = () => {
      this.runFrame();
      if (onFrame) onFrame();
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.stop();
    this.animationFrameId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  runFrame() {}

  serializeState() {
    return null;
  }

  loadSerializedState(_state) {}

  destroy() {
    this.stop();
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
