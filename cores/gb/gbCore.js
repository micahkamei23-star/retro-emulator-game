import { EmulatorCoreInterface, uint8ToBase64, base64ToUint8 } from '../../js/emulators/core-interface.js';
import { loadScript } from '../../js/emulators/script-loader.js';

const SCREEN_WIDTH = 160;
const SCREEN_HEIGHT = 144;
const CPU_TICKS_PER_SECOND = 4194304;
const AUDIO_FRAMES = 4096;
const EVENT_NEW_FRAME = 1;
const EVENT_UNTIL_TICKS = 4;
const CGB_COLOR_CURVE = 2;
const TICKS_PER_FRAME = CPU_TICKS_PER_SECOND / 60;

// Module-level cache so the WASM binary is only fetched and compiled once
// even when the user switches between systems multiple times.
let _binjgbModulePromise = null;

async function loadBinjgbModule() {
  if (!_binjgbModulePromise) {
    await loadScript('./cores/gb/binjgb.js');
    if (typeof window.Binjgb !== 'function') {
      throw new Error('[GBCore] binjgb core unavailable — add cores/gb/binjgb.js');
    }
    _binjgbModulePromise = window.Binjgb();
  }
  return _binjgbModulePromise;
}

export default class GBCore extends EmulatorCoreInterface {
  constructor(canvas) {
    super(canvas);
    this.canvas.width = SCREEN_WIDTH;
    this.canvas.height = SCREEN_HEIGHT;
    this.ctx.imageSmoothingEnabled = false;

    this.module = null;
    this.e = 0;
    this.romDataPtr = 0;
    this._romBytes = null;
    this.imageData = this.ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  async init() {
    this.module = await loadBinjgbModule();
    console.log('[GBCore] binjgb WASM initialized');
  }

  async loadROM(romBuffer) {
    const bytes = romBuffer instanceof Uint8Array ? romBuffer : new Uint8Array(romBuffer);
    this._romBytes = bytes;
    this._createEmulator(bytes);
    console.log('[GBCore] ROM loaded:', bytes.length, 'bytes');
  }

  _createEmulator(bytes) {
    if (this.e) {
      this.module._emulator_delete(this.e);
      this.e = 0;
    }
    if (this.romDataPtr) {
      this.module._free(this.romDataPtr);
      this.romDataPtr = 0;
    }

    // Align size up to 32 KB boundary as required by binjgb
    const size = (bytes.length + 0x7fff) & ~0x7fff;
    this.romDataPtr = this.module._malloc(size);
    const dest = new Uint8Array(this.module.HEAP8.buffer, this.romDataPtr, size);
    dest.fill(0);
    dest.set(bytes);

    this.e = this.module._emulator_new_simple(
      this.romDataPtr,
      size,
      44100,
      AUDIO_FRAMES,
      CGB_COLOR_CURVE,
    );

    if (this.e === 0) {
      throw new Error('[GBCore] Invalid ROM or failed to create emulator instance');
    }
  }

  reset() {
    if (this.module && this._romBytes) {
      this._createEmulator(this._romBytes);
    }
  }

  getFrameBuffer() {
    if (!this.imageData) return null;
    return this.imageData.data;
  }

  runFrame() {
    if (!this.module || !this.e) return;

    const m = this.module;
    const e = this.e;

    // Apply input state
    m._set_joyp_up(e, this.inputState.up ? 1 : 0);
    m._set_joyp_down(e, this.inputState.down ? 1 : 0);
    m._set_joyp_left(e, this.inputState.left ? 1 : 0);
    m._set_joyp_right(e, this.inputState.right ? 1 : 0);
    m._set_joyp_A(e, this.inputState.a ? 1 : 0);
    m._set_joyp_B(e, this.inputState.b ? 1 : 0);
    m._set_joyp_start(e, this.inputState.start ? 1 : 0);
    m._set_joyp_select(e, this.inputState.select ? 1 : 0);

    // Run one video frame's worth of CPU ticks
    const targetTicks = m._emulator_get_ticks_f64(e) + TICKS_PER_FRAME;
    while (true) {
      const event = m._emulator_run_until_f64(e, targetTicks);
      if (event & EVENT_NEW_FRAME) {
        // Copy the RGBA framebuffer from WASM memory into our ImageData.
        // Always re-read the pointer in case WASM memory grew.
        const ptr = m._get_frame_buffer_ptr(e);
        const size = m._get_frame_buffer_size(e);
        const src = new Uint8Array(m.HEAP8.buffer, ptr, size);
        this.imageData.data.set(src);
      }
      if (event & EVENT_UNTIL_TICKS) {
        break;
      }
    }

    if (this.imageData) {
      this.ctx.putImageData(this.imageData, 0, 0);
    }
  }

  serializeState() {
    if (!this.module || !this.e) return null;
    const m = this.module;
    const fileDataPtr = m._state_file_data_new(this.e);
    const ptr = m._get_file_data_ptr(fileDataPtr);
    const size = m._get_file_data_size(fileDataPtr);
    m._emulator_write_state(this.e, fileDataPtr);
    // Copy before deleting the file data struct
    const copy = new Uint8Array(new Uint8Array(m.HEAP8.buffer, ptr, size));
    m._file_data_delete(fileDataPtr);
    return uint8ToBase64(copy);
  }

  loadSerializedState(state) {
    if (!this.module || !this.e) return;
    const m = this.module;
    const bytes = base64ToUint8(state);
    const fileDataPtr = m._state_file_data_new(this.e);
    const ptr = m._get_file_data_ptr(fileDataPtr);
    const size = m._get_file_data_size(fileDataPtr);
    if (size === bytes.length) {
      const buffer = new Uint8Array(m.HEAP8.buffer, ptr, size);
      buffer.set(bytes);
      m._emulator_read_state(this.e, fileDataPtr);
    }
    m._file_data_delete(fileDataPtr);
  }

  destroy() {
    super.destroy();
    if (this.module && this.e) {
      this.module._emulator_delete(this.e);
      this.e = 0;
    }
    if (this.module && this.romDataPtr) {
      this.module._free(this.romDataPtr);
      this.romDataPtr = 0;
    }
    this.module = null;
    this._romBytes = null;
    this.imageData = null;
  }
}
