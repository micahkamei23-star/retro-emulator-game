const CORE_CONFIG = {
  nes: {
    wasmUrl: '/cores/fceumm/nes.wasm',
    width: 256,
    height: 240,
    aspect: '4 / 3',
  },
  gba: {
    wasmUrl: '/cores/mgba/mgba.wasm',
    width: 240,
    height: 160,
    aspect: '3 / 2',
  },
  snes: {
    wasmUrl: '/cores/snes9x/snes9x.wasm',
    width: 256,
    height: 224,
    aspect: '8 / 7',
  },
  gb: {
    // If you have a dedicated GB core, point this at it instead.
    wasmUrl: '/cores/mgba/mgba.wasm',
    width: 160,
    height: 144,
    aspect: '10 / 9',
  },
};

const EXTENSION_TO_SYSTEM = {
  '.nes': 'nes',
  '.gba': 'gba',
  '.sfc': 'snes',
  '.smc': 'snes',
  '.gb': 'gb',
  '.gbc': 'gb',
};

function detectSystem(filename) {
  const lower = filename.toLowerCase();
  const match = Object.keys(EXTENSION_TO_SYSTEM).find((ext) => lower.endsWith(ext));
  return match ? EXTENSION_TO_SYSTEM[match] : null;
}

class WasmEmulatorRuntime {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.config = config;
    this.exports = null;
    this.memory = null;
    this.romPtr = 0;
    this.romLength = 0;
    this.imageData = null;
    this.rafId = null;
  }

  async init() {
    const response = await fetch(this.config.wasmUrl);
    if (!response.ok) {
      throw new Error(`Core fetch failed: ${this.config.wasmUrl}`);
    }

    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    this.exports = instance.exports;
    this.memory = this.exports.memory;

    if (!this.memory) {
      throw new Error('WASM core must export memory');
    }

    this.canvas.width = this.config.width;
    this.canvas.height = this.config.height;
    this.canvas.style.aspectRatio = this.config.aspect;
    this.imageData = this.ctx.createImageData(this.config.width, this.config.height);

    if (typeof this.exports.init === 'function') {
      this.exports.init(this.config.width, this.config.height);
    }
  }

  alloc(length) {
    if (typeof this.exports.malloc !== 'function') {
      throw new Error('WASM core must export malloc');
    }

    return this.exports.malloc(length);
  }

  free(ptr) {
    if (ptr && typeof this.exports.free === 'function') {
      this.exports.free(ptr);
    }
  }

  loadROM(romBytes) {
    if (typeof this.exports.load_rom !== 'function') {
      throw new Error('WASM core must export load_rom(ptr, len)');
    }

    this.romLength = romBytes.length;
    this.romPtr = this.alloc(this.romLength);
    new Uint8Array(this.memory.buffer, this.romPtr, this.romLength).set(romBytes);

    const rc = this.exports.load_rom(this.romPtr, this.romLength);
    if (typeof rc === 'number' && rc !== 0) {
      throw new Error(`Core rejected ROM (error code: ${rc})`);
    }
  }

  renderFrame() {
    const width = this.config.width;
    const height = this.config.height;

    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;

    if (typeof this.exports.frame === 'function') {
      this.exports.frame();
    }

    if (
      typeof this.exports.get_frame_ptr !== 'function'
      || typeof this.exports.get_frame_size !== 'function'
    ) {
      return;
    }

    const ptr = this.exports.get_frame_ptr();
    const size = this.exports.get_frame_size();
    if (!ptr || !size) return;

    const expectedSize = width * height * 4;
    const frame = new Uint8ClampedArray(this.memory.buffer, ptr, size);
    if (frame.length < expectedSize) return;
    const safeFrame = frame.length > expectedSize
      ? frame.subarray(0, expectedSize)
      : frame;

    this.ctx.imageSmoothingEnabled = false;
    this.imageData.data.set(safeFrame);
    this.ctx.putImageData(this.imageData, 0, 0);
  }

  start() {
    const tick = () => {
      this.renderFrame();
      this.rafId = requestAnimationFrame(tick);
    };

    if (!this.rafId) {
      this.rafId = requestAnimationFrame(tick);
    }
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  destroy() {
    this.stop();
    this.free(this.romPtr);
    this.romPtr = 0;
    this.romLength = 0;
  }
}

let activeRuntime = null;

/**
 * startGame(file)
 * 1) Detect ROM system from extension
 * 2) Load matching WASM core
 * 3) Read ROM into Uint8Array
 * 4) Pass ROM to core
 * 5) Start requestAnimationFrame render loop on #emulator-screen
 */
export async function startGame(file) {
  if (!(file instanceof File)) {
    throw new Error('startGame(file) expects a File object');
  }

  const system = detectSystem(file.name);
  if (!system) {
    throw new Error(`Unsupported ROM extension: ${file.name}`);
  }

  const config = CORE_CONFIG[system];
  if (!config) {
    throw new Error(`No core config found for system: ${system}`);
  }

  const canvas = document.getElementById('emulator-screen');
  if (!canvas) {
    throw new Error('Canvas #emulator-screen not found');
  }

  if (activeRuntime) {
    activeRuntime.destroy();
    activeRuntime = null;
  }

  const romArrayBuffer = await file.arrayBuffer();
  const romBytes = new Uint8Array(romArrayBuffer);

  const runtime = new WasmEmulatorRuntime(canvas, config);
  await runtime.init();
  runtime.loadROM(romBytes);
  runtime.start();

  activeRuntime = runtime;
  return { system, runtime };
}

export function stopGame() {
  if (!activeRuntime) return;
  activeRuntime.destroy();
  activeRuntime = null;
}

export { detectSystem };
