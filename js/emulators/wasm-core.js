import { EmulatorCoreInterface, uint8ToBase64, base64ToUint8 } from './core-interface.js';

const BUTTONS = ['a', 'b', 'select', 'start', 'right', 'left', 'up', 'down'];

export default class WasmCore extends EmulatorCoreInterface {
  constructor(canvas, config) {
    super(canvas);
    this.config = config;
    this.module = null;
    this.exports = null;
    this.memory = null;
    this.width = config.width;
    this.height = config.height;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.imageData = this.ctx.createImageData(this.width, this.height);
  }

  async init() {
    const response = await fetch(this.config.url);
    if (!response.ok) {
      throw new Error(`Unable to fetch ${this.config.label} core at ${this.config.url}`);
    }

    const wasmBytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(wasmBytes, this.config.imports || {});
    this.exports = instance.exports;
    this.memory = this.exports.memory;

    if (this.exports.init) {
      this.exports.init(this.width, this.height);
    }
  }

  alloc(data) {
    if (!this.exports.malloc) {
      throw new Error(`${this.config.label} core missing malloc export`);
    }

    const ptr = this.exports.malloc(data.length);
    new Uint8Array(this.memory.buffer, ptr, data.length).set(data);
    return ptr;
  }

  free(ptr) {
    if (ptr && this.exports.free) {
      this.exports.free(ptr);
    }
  }

  async loadROM(romBuffer) {
    const romBytes = new Uint8Array(romBuffer);
    const ptr = this.alloc(romBytes);
    try {
      if (!this.exports.load_rom) {
        throw new Error(`${this.config.label} core missing load_rom export`);
      }
      this.exports.load_rom(ptr, romBytes.length);
    } finally {
      this.free(ptr);
    }
  }

  getFrameBuffer() {
    if (!this.imageData) return null;
    return this.imageData.data;
  }

  runFrame() {
    // Enforce canvas at native resolution
    if (this.canvas.width !== this.width) this.canvas.width = this.width;
    if (this.canvas.height !== this.height) this.canvas.height = this.height;

    BUTTONS.forEach((button, index) => {
      if (this.exports.set_button) {
        this.exports.set_button(index, this.inputState[button] ? 1 : 0);
      }
    });

    if (this.exports.frame) {
      this.exports.frame();
    }

    if (!this.exports.get_frame_ptr || !this.exports.get_frame_size) return;

    const ptr = this.exports.get_frame_ptr();
    const size = this.exports.get_frame_size();
    if (!ptr || !size) return;

    const frame = new Uint8ClampedArray(this.memory.buffer, ptr, size);

    const actualHeight = Math.floor(frame.length / (this.width * 4));
    const expectedHeight = this.height;
    const startRow = Math.floor((actualHeight - expectedHeight) / 2);
    const dst = new Uint8ClampedArray(this.width * expectedHeight * 4);
    for (let y = 0; y < expectedHeight; y++) {
      const srcOffset = (y + startRow) * this.width * 4;
      const dstOffset = y * this.width * 4;
      dst.set(frame.subarray(srcOffset, srcOffset + this.width * 4), dstOffset);
    }

    this.ctx.imageSmoothingEnabled = false;
    const imageData = new ImageData(dst, this.width, expectedHeight);
    this.ctx.putImageData(imageData, 0, 0);
  }

  serializeState() {
    if (!this.exports.save_state || !this.exports.get_state_size) return null;

    const ptr = this.exports.save_state();
    const size = this.exports.get_state_size();
    if (!ptr || !size) return null;

    const state = new Uint8Array(this.memory.buffer, ptr, size);
    return uint8ToBase64(state);
  }

  loadSerializedState(state) {
    if (!state || !this.exports.load_state) return;

    const bytes = base64ToUint8(state);
    const ptr = this.alloc(bytes);
    try {
      this.exports.load_state(ptr, bytes.length);
    } finally {
      this.free(ptr);
    }
  }

  destroy() {
    super.destroy();
    this.module = null;
    this.exports = null;
    this.memory = null;
    this.imageData = null;
  }
}
