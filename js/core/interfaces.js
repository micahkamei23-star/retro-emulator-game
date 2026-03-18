/**
 * Core Interface Contract
 *
 * Every emulator core MUST implement the following methods.
 * Existing cores extend EmulatorCoreInterface which already satisfies this
 * contract after the stabilization update.
 *
 * Required methods:
 *   init(romData)        — Initialize the core; optionally accept ROM bytes.
 *   reset()              — Reset the core to power-on state (ROM stays loaded).
 *   stepFrame()          — Advance emulation by one video frame.
 *   getFrameBuffer()     — Return the current RGBA pixel buffer (Uint8ClampedArray | null).
 *   setInput(inputState) — Accept a { button: boolean } input state object.
 *   getAudioBuffer()     — Return the current audio sample buffer (Float32Array | null).
 *   destroy()            — Release all resources and stop the render loop.
 */

export const REQUIRED_CORE_METHODS = [
  'init',
  'reset',
  'stepFrame',
  'getFrameBuffer',
  'setInput',
  'getAudioBuffer',
  'destroy',
];

/**
 * Validates that an object satisfies the core interface contract.
 * @param {object} core
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateCoreInterface(core) {
  const missing = REQUIRED_CORE_METHODS.filter(
    (method) => typeof core[method] !== 'function',
  );
  return { valid: missing.length === 0, missing };
}
