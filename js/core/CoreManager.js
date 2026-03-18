/**
 * CoreManager
 *
 * Central coordinator that manages the lifecycle of emulator cores.
 * It wraps EmulatorLoader and enforces the core interface contract.
 *
 * Responsibilities:
 *  - Load / unload cores cleanly
 *  - Route input → active core
 *  - Route stepFrame → active core
 *  - Route render → active core framebuffer
 *  - Prevent multiple cores running simultaneously
 */

import { validateCoreInterface } from './interfaces.js';

export default class CoreManager {
  /**
   * @param {EmulatorLoader} loader — the existing loader instance
   */
  constructor(loader) {
    this.loader = loader;
    this.activeCore = null;
    this.activeSystem = null;
  }

  /**
   * Load a core for the given system, destroying any active core first.
   * @param {string} system — e.g. 'nes', 'gb', 'gba'
   * @returns {Promise<object>} loaded entry { core, config, systemName }
   */
  async loadCore(system) {
    // Unload previous core
    this.unload();

    const loaded = await this.loader.loadCore(system);
    this.activeCore = loaded.core;
    this.activeSystem = system;

    // Validate interface contract
    const { valid, missing } = validateCoreInterface(this.activeCore);
    if (!valid) {
      console.warn(
        `[CoreManager] Core for "${system}" is missing interface methods:`,
        missing.join(', '),
      );
    }

    return loaded;
  }

  /**
   * Unload the current core and clean up.
   */
  unload() {
    if (this.activeCore) {
      this.activeCore.destroy();
      console.log('[CoreManager] Core destroyed:', this.activeSystem);
    }
    this.activeCore = null;
    this.activeSystem = null;
    // Sync the underlying loader
    this.loader.destroyActive();
  }

  /**
   * Route input state to the active core.
   * @param {object} inputState — { button: boolean }
   */
  setInput(inputState) {
    if (this.activeCore) {
      this.activeCore.setInput(inputState);
    }
  }

  /**
   * Step the active core by one frame.
   */
  stepFrame() {
    if (this.activeCore) {
      this.activeCore.stepFrame();
    }
  }

  /**
   * Get the active core's current framebuffer.
   * @returns {Uint8ClampedArray|null}
   */
  getFrameBuffer() {
    if (this.activeCore) {
      return this.activeCore.getFrameBuffer();
    }
    return null;
  }

  /**
   * Get the active core's current audio buffer.
   * @returns {Float32Array|null}
   */
  getAudioBuffer() {
    if (this.activeCore) {
      return this.activeCore.getAudioBuffer();
    }
    return null;
  }

  /**
   * Reset the active core.
   */
  reset() {
    if (this.activeCore) {
      this.activeCore.reset();
    }
  }

  /**
   * Whether a core is currently loaded and running.
   * @returns {boolean}
   */
  get isActive() {
    return this.activeCore !== null;
  }
}
