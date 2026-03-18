# Emulator Core Integration Contract

This UI expects the emulator core to expose a global object `window.emuCore` or be passed to `EmuUI.setCore(core)`.

Required core methods (at least one of the input methods below must exist):
- `core.attachCanvas(mainCanvas: HTMLCanvasElement, secondaryCanvas?: HTMLCanvasElement): void` (optional but recommended)
- `core.setKeys(mask: number): void` OR `core.setInput(mask: number): void` OR `core.joypadSet(mask: number): void`  
  - The UI will attempt `setKeys`, then `setInput`, then `joypadSet`.
- `core` should not be re-created by this UI. The UI must not call core.init() or core.reset().

Important: DO NOT change or recreate canvas elements after initial attach. The UI will not reinitialize canvases.

Input bit mapping expected by UI (default)
- RIGHT = bit 0
- LEFT  = bit 1
- UP    = bit 2
- DOWN  = bit 3
- A     = bit 4
- B     = bit 5
- SELECT= bit 6
- START = bit 7

If core expects different ordering, change the `InputBits` map in `engine.js`.
