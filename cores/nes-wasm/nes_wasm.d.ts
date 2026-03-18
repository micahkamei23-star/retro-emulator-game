/* tslint:disable */
/* eslint-disable */

export class WasmNes {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get framebuffer length
     */
    framebuffer_len(): number;
    /**
     * Get pointer to the RGBA framebuffer (256x240x4 bytes)
     */
    framebuffer_ptr(): number;
    /**
     * Load a ROM from bytes
     */
    load_rom(data: Uint8Array): void;
    /**
     * Creates a new WasmNes instance
     */
    constructor();
    /**
     * Press a joypad1 button by index:
     * 0=A, 1=B, 2=Select, 3=Start, 4=Up, 5=Down, 6=Left, 7=Right
     */
    press_button(index: number): void;
    /**
     * Release a joypad1 button by index
     */
    release_button(index: number): void;
    /**
     * Reset the emulator
     */
    reset(): void;
    /**
     * Set all 8 buttons at once from a bitmask
     * bit0=A, bit1=B, bit2=Select, bit3=Start, bit4=Up, bit5=Down, bit6=Left, bit7=Right
     */
    set_buttons(mask: number): void;
    /**
     * Execute one full frame
     */
    step_frame(): void;
    /**
     * Copy current PPU pixels into the internal RGBA framebuffer
     */
    update_framebuffer(): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmnes_free: (a: number, b: number) => void;
    readonly wasmnes_framebuffer_len: (a: number) => number;
    readonly wasmnes_framebuffer_ptr: (a: number) => number;
    readonly wasmnes_load_rom: (a: number, b: number, c: number) => void;
    readonly wasmnes_new: () => number;
    readonly wasmnes_press_button: (a: number, b: number) => void;
    readonly wasmnes_release_button: (a: number, b: number) => void;
    readonly wasmnes_reset: (a: number) => void;
    readonly wasmnes_set_buttons: (a: number, b: number) => void;
    readonly wasmnes_step_frame: (a: number) => void;
    readonly wasmnes_update_framebuffer: (a: number) => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
