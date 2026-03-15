'use strict';

const CORE_CONFIG = {
  nes: { label: 'NES', extensions: ['.nes'], url: 'wasm/nes.wasm' },
  snes: { label: 'SNES', extensions: ['.sfc', '.smc'], url: 'wasm/snes.wasm' },
  gb: { label: 'Game Boy', extensions: ['.gb'], url: 'wasm/gb.wasm' },
  gba: { label: 'Game Boy Advance', extensions: ['.gba'], url: 'wasm/gba.wasm' },
};

class EmulatorLoader {
  constructor() {
    this.cores = {};
  }

  static listSystems() {
    return CORE_CONFIG;
  }

  resolveSystemByFilename(filename) {
    const lowerName = filename.toLowerCase();
    return Object.entries(CORE_CONFIG).find(([, value]) =>
      value.extensions.some((ext) => lowerName.endsWith(ext)),
    )?.[0];
  }

  async loadCore(system) {
    const selectedCore = CORE_CONFIG[system];
    if (!selectedCore) {
      throw new Error(`Unsupported system: ${system}`);
    }

    if (this.cores[system]) {
      return this.cores[system];
    }

    try {
      const response = await fetch(selectedCore.url);
      if (!response.ok) {
        throw new Error(`Unable to fetch core (${response.status})`);
      }
      const buffer = await response.arrayBuffer();
      const module = await WebAssembly.instantiate(buffer, {});
      this.cores[system] = { type: 'wasm', instance: module.instance, config: selectedCore };
    } catch (error) {
      this.cores[system] = { type: 'mock', instance: null, config: selectedCore, error };
    }

    return this.cores[system];
  }
}

export default EmulatorLoader;
