import NESWasmCore from './emulators/nes-wasm-core.js';
import GBCore from '../cores/gb/gbCore.js';
import WasmCore from './emulators/wasm-core.js';

const CORE_CONFIG = {
  nes: {
    label: 'NES (Rust WASM)',
    systemName: 'NES',
    extensions: ['.nes'],
    createCore: (canvas) => new NESWasmCore(canvas),
    assets: ['./cores/nes-wasm/nes_wasm_bg.wasm'],
  },
  gb: {
    label: 'Game Boy / Color (binjgb)',
    systemName: 'Game Boy',
    extensions: ['.gb', '.gbc'],
    createCore: (canvas) => new GBCore(canvas),
    assets: ['./cores/gb/binjgb.wasm'],
  },
  gba: {
    label: 'Game Boy Advance (mGBA WASM)',
    systemName: 'Game Boy Advance',
    extensions: ['.gba'],
    createCore: (canvas) => new WasmCore(canvas, {
      label: 'mGBA',
      url: './cores/mgba/mgba.wasm',
      width: 240,
      height: 160,
    }),
    assets: ['./cores/mgba/mgba.wasm'],
  },
  snes: {
    label: 'SNES (Snes9x WASM)',
    systemName: 'SNES',
    extensions: ['.sfc', '.smc'],
    createCore: (canvas) => new WasmCore(canvas, {
      label: 'Snes9x',
      url: './cores/snes9x/snes9x.wasm',
      width: 256,
      height: 224,
    }),
    assets: ['./cores/snes9x/snes9x.wasm'],
  },
};

class EmulatorLoader {
  constructor(canvas) {
    this.canvas = canvas;
    this.activeEntry = null;
    this.activeSystem = null;
  }

  static listSystems() {
    return CORE_CONFIG;
  }

  static getCoreAssets() {
    return Object.values(CORE_CONFIG).flatMap((core) => core.assets || []);
  }

  resolveSystemByFilename(filename) {
    const lowerName = filename.toLowerCase();
    return Object.entries(CORE_CONFIG).find(([, value]) =>
      value.extensions.some((ext) => lowerName.endsWith(ext)))?.[0];
  }

  destroyActive() {
    if (this.activeEntry) {
      this.activeEntry.core.destroy();
      console.log('Core destroyed');
      this.activeEntry = null;
      this.activeSystem = null;
    }
  }

  async loadCore(system) {
    const config = CORE_CONFIG[system];
    if (!config) throw new Error(`Unsupported system: ${system}`);

    console.log('Loading core:', system);

    // Always destroy existing core before creating a new one
    this.destroyActive();

    const core = config.createCore(this.canvas);
    await core.init();

    const loaded = {
      type: 'native',
      core,
      config,
      systemName: config.systemName,
    };

    this.activeEntry = loaded;
    this.activeSystem = system;
    console.log('New core created');
    return loaded;
  }

  unloadCore(system) {
    console.log('Unloading core:', system);
    if (this.activeSystem === system) {
      this.destroyActive();
    }
    console.log('Loader reset');
  }

  unloadAll() {
    this.destroyActive();
    console.log('Loader reset');
  }
}

export default EmulatorLoader;
