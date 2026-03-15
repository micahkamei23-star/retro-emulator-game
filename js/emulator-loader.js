import NESCore from './emulators/nes-core.js';
import GameBoyCore from './emulators/gb-core.js';
import WasmCore from './emulators/wasm-core.js';

const CORE_CONFIG = {
  nes: {
    label: 'NES (jsnes)',
    systemName: 'NES',
    extensions: ['.nes'],
    createCore: (canvas) => new NESCore(canvas),
    assets: ['./cores/jsnes/jsnes.min.js'],
  },
  gb: {
    label: 'Game Boy / Color (GameBoy.js)',
    systemName: 'Game Boy',
    extensions: ['.gb', '.gbc'],
    createCore: (canvas) => new GameBoyCore(canvas),
    assets: ['./cores/gameboy/gameboy.min.js'],
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
    this.cores = new Map();
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

  async loadCore(system) {
    const config = CORE_CONFIG[system];
    if (!config) throw new Error(`Unsupported system: ${system}`);

    if (this.cores.has(system)) return this.cores.get(system);

    const core = config.createCore(this.canvas);
    await core.init();

    const loaded = {
      type: 'native',
      core,
      config,
      systemName: config.systemName,
    };

    this.cores.set(system, loaded);
    return loaded;
  }

  unloadAll() {
    this.cores.forEach((entry) => entry.core.destroy());
    this.cores.clear();
  }
}

export default EmulatorLoader;
