'use strict';

/**
 * Emulator Loader for WebAssembly cores.
 * Supports:
 * - NES
 * - SNES
 * - Game Boy
 * - GBA
 */

class EmulatorLoader {
    constructor() {
        this.cores = {};
    }

    async loadCore(coreName, url) {
        if (this.cores[coreName]) {
            console.warn(`${coreName} core is already loaded.`);
            return this.cores[coreName];
        }
        try {
            const response = await fetch(url);
            const buffer = await response.arrayBuffer();
            const module = await WebAssembly.instantiate(buffer);
            this.cores[coreName] = module.instance;
            console.log(`${coreName} core loaded successfully.`);
            return this.cores[coreName];
        } catch (error) {
            console.error(`Error loading ${coreName} core:`, error);
        }
    }

    getCore(coreName) {
        return this.cores[coreName];
    }
}

export default EmulatorLoader;
