import { EmulatorCoreInterface } from './core-interface.js';

const SCREEN_WIDTH = 256;
const SCREEN_HEIGHT = 240;
const FRAMEBUFFER_SIZE = SCREEN_WIDTH * SCREEN_HEIGHT * 4;

// Button bitmask matching Rust WasmNes::set_buttons:
// bit0=A, bit1=B, bit2=Select, bit3=Start, bit4=Up, bit5=Down, bit6=Left, bit7=Right
const BUTTON_BITS = {
  a: 0,
  b: 1,
  select: 2,
  start: 3,
  up: 4,
  down: 5,
  left: 6,
  right: 7,
};

export default class NESWasmCore extends EmulatorCoreInterface {
  constructor(canvas) {
    super(canvas);
    this.canvas.width = SCREEN_WIDTH;
    this.canvas.height = SCREEN_HEIGHT;
    this.imageData = this.ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
    this.wasm = null;
    this.nes = null;
  }

  async init() {
    console.log('[NESWasmCore] Loading WASM module...');

    // Import the wasm-bindgen generated JS glue
    const glue = await import('../../cores/nes-wasm/nes_wasm.js');

    // Initialize WASM (fetches and instantiates the .wasm file)
    this.wasm = await glue.default('./cores/nes-wasm/nes_wasm_bg.wasm');

    // Create the NES emulator instance
    this.nes = new glue.WasmNes();

    console.log('[NESWasmCore] WASM initialized');
  }

  async loadROM(romBuffer) {
    const bytes = romBuffer instanceof Uint8Array ? romBuffer : new Uint8Array(romBuffer);
    console.log('[NESWasmCore] Loading ROM:', bytes.length, 'bytes');

    this.nes.load_rom(bytes);
    console.log('[NESWasmCore] ROM loaded');
  }

  runFrame() {
    // Build button bitmask from input state
    let mask = 0;
    for (const [button, bit] of Object.entries(BUTTON_BITS)) {
      if (this.inputState[button]) {
        mask |= (1 << bit);
      }
    }
    this.nes.set_buttons(mask);

    // Execute one frame of emulation
    this.nes.step_frame();

    // Copy the RGBA framebuffer from WASM memory directly into ImageData
    this.nes.update_framebuffer();
    const ptr = this.nes.framebuffer_ptr();
    const pixels = new Uint8ClampedArray(this.wasm.memory.buffer, ptr, FRAMEBUFFER_SIZE);
    this.imageData.data.set(pixels);

    this.ctx.putImageData(this.imageData, 0, 0);
  }

  destroy() {
    super.destroy();
    if (this.nes) {
      this.nes.free();
      this.nes = null;
    }
    this.wasm = null;
    this.imageData = null;
  }
}
