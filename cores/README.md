# Emulator core assets

Place runtime core files in these paths so the loader can start each emulator:

- `cores/jsnes/jsnes.min.js` (NES via jsnes)
- `cores/gameboy/gameboy.min.js` (Game Boy / Game Boy Color via GameBoy.js)
- `cores/mgba/mgba.wasm` (GBA via mGBA WASM build exposing `init`, `load_rom`, `frame`, `set_button`, frame pointer exports, and save-state exports)
- `cores/snes9x/snes9x.wasm` (SNES via Snes9x WASM build exposing the same host ABI as above)

These files are intentionally not committed to avoid licensing/distribution issues.
