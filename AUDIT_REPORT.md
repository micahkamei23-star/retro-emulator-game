# RETRO EMULATOR — STRICT SYSTEM AUDIT REPORT

**Audit Date:** 2026-03-20
**Audit Scope:** Full codebase — all six mandated systems
**Auditor Role:** Non-remediation diagnostic only

---

## AUDIT SYSTEMS COVERED

1. Rendering Pipeline
2. ROM Loading System
3. CPU Execution Loop
4. GPU / PPU Rendering Logic
5. State & Initialization
6. Cross-Platform Issues

---

## INDIVIDUAL BUG REPORTS

---

### [BUG #1]
**Category:** ROM Loading System
**Severity:** Critical

**Location:**
`nes-wasm/src/rom.rs` — `Rom::new()`, line 21; `RomHeader::new()`, lines 92–96

**Problem:**
`Rom::new()` slices the input `data` vector at the fixed offset `data[0..HEADER_SIZE]` (where `HEADER_SIZE = 16`) without first validating that the vector is at least 16 bytes long. Any input shorter than 16 bytes triggers an out-of-bounds index panic in Rust, which propagates as a WASM trap.

**Root Cause:**
```rust
// rom.rs line 21
let header = RomHeader::new(data[0..HEADER_SIZE].to_vec());
```
`data[0..16]` is an unconditional slice. If `data.len() < 16`, Rust panics with `index out of bounds`. `RomHeader::new()` then repeats the vulnerability:
```rust
for i in 0..HEADER_SIZE {
    header.data.push(vec[i]);  // panics again if vec.len() < 16
}
```
No length check exists anywhere in the ROM construction path before these accesses.

**Impact:**
Any truncated, corrupted, or deliberately short binary passed to `WasmNes::load_rom()` causes the WASM module to trap. The trap is unrecoverable; the NES core is dead for the remainder of the session. The emulator presents a black screen with no error message surfaced to the user.

**Evidence:**
`nes-wasm/src/rom.rs:21` — `let header = RomHeader::new(data[0..HEADER_SIZE].to_vec());`
`nes-wasm/src/rom.rs:92–96` — loop `for i in 0..HEADER_SIZE { header.data.push(vec[i]); }`
`nes-wasm/src/lib.rs:109–111` — `WasmNes::load_rom()` calls `Rom::new(data.to_vec())` with no prior length guard.

---

### [BUG #2]
**Category:** Cross-Platform Issues / State & Initialization
**Severity:** Critical

**Location:**
`js/mobile-fullscreen.js` — `MobileFullscreen._bindOverlayToggle()`, lines 120–128

**Problem:**
`_bindOverlayToggle()` calls `document.getElementById('gameCanvas')` and then unconditionally calls `.addEventListener('touchend', ...)` on the returned value. The element ID `gameCanvas` does not exist anywhere in `index.html`. The actual canvas element in `index.html` is `<canvas id="screen">`. The call returns `null`, and the subsequent `null.addEventListener(...)` throws a `TypeError`.

**Root Cause:**
```js
// mobile-fullscreen.js line 120–128
_bindOverlayToggle() {
  const canvas = document.getElementById('gameCanvas');  // returns null
  canvas.addEventListener('touchend', (e) => {           // TypeError: null
    ...
  }, { passive: true });
}
```
`_bindOverlayToggle()` is called from the constructor (`this._bindOverlayToggle()`), so the crash fires at instantiation time. The ID `gameCanvas` was never defined in `index.html` (line 18: `<canvas id="screen">`).

**Impact:**
Any code path that instantiates `new MobileFullscreen(...)` throws a `TypeError` immediately and unconditionally, before any emulation begins. The mobile fullscreen and joystick overlay systems are completely non-functional. The crash also prevents the overlay, exit button, and joystick zone from being bound.

**Evidence:**
`js/mobile-fullscreen.js:121` — `const canvas = document.getElementById('gameCanvas');`
`js/mobile-fullscreen.js:122` — `canvas.addEventListener(...)` — no null guard before this call.
`index.html:18` — `<canvas id="screen">` — the element ID is `screen`, not `gameCanvas`.

---

### [BUG #3]
**Category:** ROM Loading System / State & Initialization
**Severity:** Critical

**Location:**
`js/emulator-loader.js` — `CORE_CONFIG`, lines 22–43

**Problem:**
The GBA and SNES core entries reference WASM binary files that do not exist in the repository. Selecting a `.gba` or `.sfc`/`.smc` ROM causes `WasmCore.init()` to issue a `fetch()` that will always fail with a 404.

**Root Cause:**
```js
// emulator-loader.js lines 23–43
gba: {
  createCore: (canvas) => new WasmCore(canvas, {
    url: './cores/mgba/mgba.wasm',   // file does not exist
    ...
  }),
},
snes: {
  createCore: (canvas) => new WasmCore(canvas, {
    url: './cores/snes9x/snes9x.wasm',  // file does not exist
    ...
  }),
},
```
Neither `cores/mgba/` nor `cores/snes9x/` directories exist in the repository. `WasmCore.init()` will throw:
```js
throw new Error(`Unable to fetch mGBA core at ./cores/mgba/mgba.wasm`);
```
The service worker (`service-worker.js:34–37`) also lists these files but silently swallows the fetch failure:
```js
} catch (_error) {
  // Optional emulator core may be absent in development/deploy.
}
```

**Impact:**
GBA and SNES ROM loading is completely broken. The user will see a "Failed" status. The emulator never enters a running state for these two systems.

**Evidence:**
Repository file tree — no `cores/mgba/` or `cores/snes9x/` directory exists.
`js/emulator-loader.js:26` — `url: './cores/mgba/mgba.wasm'`
`js/emulator-loader.js:36` — `url: './cores/snes9x/snes9x.wasm'`
`js/emulators/wasm-core.js:22–23` — `if (!response.ok) { throw new Error(...) }`

---

### [BUG #4]
**Category:** ROM Loading System / CPU Execution Loop
**Severity:** Major

**Location:**
`nes-wasm/src/lib.rs` — `WasmNes::load_rom()`, lines 109–111

**Problem:**
`WasmNes::load_rom()` constructs a `Rom` from the raw bytes and immediately calls `bootup()` without ever calling `rom.valid()` to verify the iNES header signature ("NES" + 0x1A magic byte). An invalid, corrupt, or wrong-format binary proceeds directly to CPU boot, which reads the reset vector from `$FFFC`/`$FFFD` in a garbage ROM.

**Root Cause:**
```rust
// lib.rs lines 109–111
pub fn load_rom(&mut self, data: &[u8]) {
    self.nes.set_rom(Rom::new(data.to_vec()));
    self.nes.bootup();   // no validity check before this
}
```
`Rom::valid()` exists and performs the required check:
```rust
// rom.rs line 62–64
pub fn valid(&self) -> bool {
    self.header.is_nes()
}
```
But it is never called in the load path.

**Impact:**
A non-NES binary (e.g., a Game Boy ROM mistakenly loaded as NES, or a partially downloaded file) causes the CPU to boot with an invalid program counter derived from garbage data at `$FFFC`. The CPU will execute random or invalid opcodes, producing a black screen, infinite loops, or unpredictable behavior with no error surfaced to the user.

**Evidence:**
`nes-wasm/src/lib.rs:109–111` — `load_rom()` body calls `set_rom()` then `bootup()` with no `valid()` call in between.
`nes-wasm/src/rom.rs:62–64` — `valid()` method exists but is unreachable from the load path.

---

### [BUG #5]
**Category:** State & Initialization
**Severity:** Major

**Location:**
`js/core/CoreManager.js` — `unload()`, lines 55–63

**Problem:**
`CoreManager.unload()` calls `this.activeCore.destroy()` to release the core, then immediately calls `this.loader.destroyActive()`, which calls `this.loader.activeEntry.core.destroy()` on the **same object** a second time.

**Root Cause:**
```js
// CoreManager.js lines 55–63
unload() {
  if (this.activeCore) {
    this.activeCore.destroy();        // First destroy call
    ...
  }
  this.activeCore = null;
  this.activeSystem = null;
  this.loader.destroyActive();        // Second destroy call (same core object)
}

// emulator-loader.js lines 67–74
destroyActive() {
  if (this.activeEntry) {
    this.activeEntry.core.destroy();  // this.activeEntry.core === the already-destroyed core
    ...
  }
}
```
`CoreManager` sets `this.activeCore = null` but never sets `this.loader.activeEntry = null`. The loader's `activeEntry` still holds a reference to the destroyed core when `destroyActive()` runs.

**Impact:**
`destroy()` executes twice on the same emulator instance. The first call frees WASM memory and stops the RAF loop; the second call operates on null/zero fields. For all current cores, null guards (`if (this.module && this.e)`, `if (this.nes)`) prevent actual double-frees. However, the double call is a latent memory safety risk. Any future core that lacks these null guards will free the same WASM pointers twice, causing undefined behavior in the WASM runtime.

**Evidence:**
`js/core/CoreManager.js:57` — `this.activeCore.destroy()`
`js/core/CoreManager.js:62` — `this.loader.destroyActive()` — called before `this.loader.activeEntry` is cleared.
`js/emulator-loader.js:69` — `this.activeEntry.core.destroy()` — same core object as above.

---

### [BUG #6]
**Category:** Rendering Pipeline / GPU / PPU Rendering Logic
**Severity:** Major

**Location:**
`js/emulators/nes-wasm-core.js` — `getFrameBuffer()`, lines 60–62
`js/emulators/wasm-core.js` — `getFrameBuffer()`, lines 65–67

**Problem:**
Both `NESWasmCore` and `WasmCore` implement `getFrameBuffer()` with an unconditional `return null`. The interface contract (`js/core/interfaces.js`) requires this method to return the current RGBA pixel buffer. Any caller relying on `getFrameBuffer()` for external access—including `CoreManager.getFrameBuffer()` and any snapshot or screenshot logic—receives `null` for these two core types regardless of emulator state.

**Root Cause:**
```js
// nes-wasm-core.js lines 60–62
getFrameBuffer() {
  return null;   // No actual framebuffer stored on the object
}

// wasm-core.js lines 65–67
getFrameBuffer() {
  return null;   // Same
}
```
Both cores render by creating a transient view directly into WASM memory inside `runFrame()` and passing it immediately to `render()`. No persistent copy is stored on the instance. Rendering works, but the interface method is broken.

**Impact:**
All external consumers of `CoreManager.getFrameBuffer()` receive `null` when the active core is NES (WASM) or any generic WASM core. Any feature built on polling the framebuffer externally—such as frame capture, automated testing via `isFrameBufferValid()`, or state-comparison tools—will silently receive no data. The `isFrameBufferValid()` utility in `renderer.js` always reports invalid for these cores.

**Evidence:**
`js/emulators/nes-wasm-core.js:60–62` — explicit `return null`.
`js/emulators/wasm-core.js:65–67` — explicit `return null`.
`js/core/interfaces.js:14` — contract states: "Return the current RGBA pixel buffer (Uint8ClampedArray | null)."
`js/core/CoreManager.js:89–94` — `getFrameBuffer()` proxies directly to the core, returning `null` for these cores.

---

### [BUG #7]
**Category:** ROM Loading System / State & Initialization
**Severity:** Major

**Location:**
`js/emulators/gb-core.js` — `loadROM()`, line 97

**Problem:**
`GameBoyCore.loadROM()` accesses `this.gb.loadROM` without first checking whether `this.gb` is non-null. If `init()` was never called, threw an error, or if the GameBoy.js library was unavailable, `this.gb` remains `null`. Accessing `.loadROM` on `null` throws `TypeError: Cannot read properties of null (reading 'loadROM')`.

**Root Cause:**
```js
// gb-core.js line 97
async loadROM(romBuffer) {
  if (this.gb.loadROM) {       // TypeError if this.gb === null
    ...
  }
}
```
There is no null check before dereferencing `this.gb`. The library that populates `this.gb` (`cores/gameboy/gameboy.min.js`) does not exist in the repository, making the null scenario the default outcome for this class.

**Impact:**
Any invocation of `GameBoyCore.loadROM()` when `init()` has failed (which is the default since the backing library is missing) throws a `TypeError` that propagates to the ROM loading caller. The error is caught by `setupRomLoader`'s `try/catch` block and displayed as "Failed - [filename]", but the root cause is obscured.

Note: `js/emulators/gb-core.js` (`GameBoyCore`) is **not** imported in `js/emulator-loader.js`; it is dead code. The active GB core is `cores/gb/gbCore.js` (`GBCore`, binjgb-based). The file is still shipped in the repository and contains this defect.

**Evidence:**
`js/emulators/gb-core.js:72–73` — `init()` sets `this.gb` from `window.GameBoyJS || window.GameBoyEmulator || window.GameBoyCore`; none exist (library is absent).
`js/emulators/gb-core.js:97` — `if (this.gb.loadROM)` — no null guard.
Repository file tree — `cores/gameboy/gameboy.min.js` does not exist.

---

### [BUG #8]
**Category:** Rendering Pipeline
**Severity:** Minor

**Location:**
`js/main.js` — `drawBootScreen()`, lines 79–92

**Problem:**
`drawBootScreen()` sets `canvas.width` and `canvas.height` directly (`canvas.width = 160; canvas.height = 144;`) instead of using `setupCanvas()`. This bypasses the high-DPI (devicePixelRatio) scaling, the offscreen canvas setup, and the storage of logical dimensions in `canvas.dataset.logicalWidth/Height`.

**Root Cause:**
```js
// main.js lines 79–92
function drawBootScreen() {
  canvas.width  = 160;   // Direct assignment — no DPR, no dataset attributes
  canvas.height = 144;
  const ctx = canvas.getContext('2d');
  ...
}
```
`setupCanvas()` in `renderer.js` is the single authoritative function for canvas dimension setup. It sets physical dimensions (`width * dpr`), CSS logical sizes, `dataset.logicalWidth/Height`, and establishes the offscreen canvas. `drawBootScreen()` performs none of these steps.

**Impact:**
On HiDPI (Retina) displays with `devicePixelRatio >= 2`, the boot screen canvas has only 160 physical pixels wide instead of the expected 320+. Text and graphics appear blurry. After `drawBootScreen()` runs following a failed game load, the canvas no longer has a valid DPR transform, causing all subsequent `render()` calls to draw at incorrect scale until `start()` re-applies `setupCanvas()`.

**Evidence:**
`js/main.js:80–81` — `canvas.width = 160; canvas.height = 144;` — direct assignment.
`js/render/renderer.js:69–103` — `setupCanvas()` shows the full initialization path that `drawBootScreen()` skips.
`js/render/renderer.js:81–82` — `canvas.dataset.logicalWidth = width; canvas.dataset.logicalHeight = height;` — never written by `drawBootScreen()`.

---

### [BUG #9]
**Category:** Cross-Platform Issues
**Severity:** Minor

**Location:**
`js/skin-engine.js` — `toggleFullscreen()`, lines 407–417

**Problem:**
`toggleFullscreen()` calls `emulator.requestFullscreen({ navigationUI: 'hide' })` on the `#emulator` `<div>` element. iOS Safari does not support `requestFullscreen()` on arbitrary elements. The call throws `NotSupportedError`, which is caught and silently discarded. No feedback is provided to the user.

**Root Cause:**
```js
// skin-engine.js lines 407–417
export async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await emulator.requestFullscreen({ navigationUI: 'hide' });
    } else {
      await document.exitFullscreen();
    }
  } catch (e) {
    console.warn('[skin-engine] toggleFullscreen:', e.message);  // silent failure
  }
}
```
iOS Safari (as of iOS 16) restricts `requestFullscreen()` support. Only `<video>` elements with `webkitEnterFullscreen()` work reliably. The `{ navigationUI: 'hide' }` option is also not recognized on iOS.

**Impact:**
Tapping the fullscreen button on iOS Safari does nothing visible. The `console.warn` fires but is invisible to the user. Fullscreen is permanently non-functional on iOS Safari. This affects all iOS devices running Safari, which is a significant portion of mobile users.

**Evidence:**
`js/skin-engine.js:410` — `await emulator.requestFullscreen({ navigationUI: 'hide' })`.
`js/skin-engine.js:415` — `catch (e) { console.warn(...) }` — no user-facing failure feedback.
MDN Web Docs: `requestFullscreen()` is not supported on arbitrary elements in iOS Safari.

---

### [BUG #10]
**Category:** GPU / PPU Rendering Logic / Cross-Platform Issues
**Severity:** Minor

**Location:**
`js/mobile-fullscreen.js` — `ANGLE_HYSTERESIS` constant, line 12; `_processJoystickMove()`, lines 253–265

**Problem:**
`ANGLE_HYSTERESIS` is defined as `12 * (Math.PI / 180)` (approximately 12 degrees) and is documented as preventing direction flickering at diagonal inputs. However, the constant is never referenced anywhere in the file. The `_processJoystickMove()` direction detection uses a raw `absX > absY` axis comparison with no hysteresis zone applied.

**Root Cause:**
```js
// mobile-fullscreen.js line 12
const ANGLE_HYSTERESIS = 12 * (Math.PI / 180);  // defined but never used

// _processJoystickMove() lines 253–265
if (absX > absY) {
  newDirs[dx > 0 ? 'right' : 'left'] = true;
} else {
  newDirs[dy > 0 ? 'down' : 'up'] = true;
}
// ANGLE_HYSTERESIS is referenced nowhere here
```
The hysteresis logic was either planned and never implemented, or was removed from `_processJoystickMove()` but the constant was not cleaned up.

**Impact:**
At diagonal input angles (approximately 45 degrees), the joystick direction flips rapidly between horizontal and vertical as the thumb moves. Intended hysteresis of ±12 degrees around the axis boundary is absent. The player experiences direction flickering when trying to move diagonally, making precise directional control difficult on mobile.

**Evidence:**
`js/mobile-fullscreen.js:12` — `const ANGLE_HYSTERESIS = 12 * (Math.PI / 180);`
`js/mobile-fullscreen.js:253–265` — `_processJoystickMove()` direction logic — no reference to `ANGLE_HYSTERESIS`.
`DIRECTION_ANGLES` constant at line 14 is also defined but never referenced in direction detection.

---

### [BUG #11]
**Category:** CPU Execution Loop
**Severity:** Minor

**Location:**
`nes-wasm/src/cpu.rs` — `instruction_name()`, line 179

**Problem:**
The `ORA` instruction's debug name string is `"qra"` instead of `"ora"`. This is a typo.

**Root Cause:**
```rust
// cpu.rs line 179
InstructionTypes::ORA => "qra",  // should be "ora"
```
All other instruction names use the correct lowercase NES mnemonic. `ORA` (Logical OR with Accumulator) is one of the most frequently used NES opcodes and appears in 7 separate opcode entries (0x01, 0x05, 0x09, 0x0D, 0x11, 0x15, 0x19, 0x1D).

**Impact:**
Any debug logging or disassembly output that uses `instruction_name()` for ORA opcodes will display `"qra"` instead of `"ora"`. CPU trace logs, instruction debuggers, or diagnostic tools built on this function will produce incorrect output for ORA instructions, making debugging and ROM verification significantly harder.

**Evidence:**
`nes-wasm/src/cpu.rs:179` — `InstructionTypes::ORA => "qra",`
Compare with adjacent correct entries: `InstructionTypes::NOP => "nop"`, `InstructionTypes::PHA => "pha"`.

---

### [BUG #12]
**Category:** Rendering Pipeline / State & Initialization
**Severity:** Minor

**Location:**
`js/start-game-example.js` — `startGame()`, lines 196–198

**Problem:**
`startGame()` looks up `document.getElementById('emulator-screen')` for its rendering canvas. The element ID `emulator-screen` does not exist in `index.html`. The actual canvas in `index.html` is `<canvas id="screen">`.

**Root Cause:**
```js
// start-game-example.js lines 196–198
const canvas = document.getElementById('emulator-screen');
if (!canvas) {
  throw new Error('Canvas #emulator-screen not found');
}
```
The expected element ID does not match the actual DOM. While there is a null check (the function throws with a message), the canvas lookup will always fail in the application's HTML. The `WasmEmulatorRuntime` is never created; no game ever starts via this API entry point.

**Impact:**
`startGame()` always throws `Error: Canvas #emulator-screen not found` when called in the context of `index.html`. Any external integration that calls `startGame()` (e.g., third-party wrappers or test harnesses) receives an error immediately upon invocation, before any WASM or ROM loading begins.

**Evidence:**
`js/start-game-example.js:196` — `document.getElementById('emulator-screen')` — ID does not exist.
`index.html:18` — `<canvas id="screen">` — the actual canvas ID is `screen`.

---

## FINAL REPORT

### Total Bugs Found
**12 confirmed bugs**
- Critical: 3
- Major: 4
- Minor: 5

---

### Top 5 Most Critical Failures

1. **[BUG #1] — ROM data length panic in Rust (`nes-wasm/src/rom.rs`)**
   Any ROM shorter than 16 bytes causes an out-of-bounds Rust panic, trapping the WASM module unrecoverably. The NES core becomes permanently dead.

2. **[BUG #3] — GBA and SNES WASM binaries missing from repository (`js/emulator-loader.js`)**
   Both `cores/mgba/mgba.wasm` and `cores/snes9x/snes9x.wasm` do not exist. All GBA and SNES ROM loads fail with a network error immediately.

3. **[BUG #2] — `MobileFullscreen._bindOverlayToggle()` TypeError on null canvas (`js/mobile-fullscreen.js`)**
   The constructor references a canvas ID (`#gameCanvas`) that does not exist in `index.html`. Instantiation always throws `TypeError`, rendering the mobile fullscreen and joystick overlay systems completely broken.

4. **[BUG #4] — NES emulator boots without ROM validation (`nes-wasm/src/lib.rs`)**
   `WasmNes::load_rom()` never calls `rom.valid()`. A non-NES binary loads silently and executes garbage CPU instructions, producing a black screen with no error.

5. **[BUG #5] — Double-destroy of active emulator core (`js/core/CoreManager.js`)**
   `CoreManager.unload()` calls `destroy()` twice on the same core object. Currently safe due to null guards, but any future core without null guards will trigger a double-free in WASM memory, causing undefined behavior.

---

### Systems Most Likely Responsible for Black Screen

The following failure chains most directly produce a black screen (canvas renders nothing):

1. **Missing GBA/SNES WASM** (BUG #3) — GBA and SNES ROMs: `WasmCore.init()` throws before the core starts; no RAF loop starts; canvas remains at the boot screen or draws nothing.

2. **No ROM validity check before CPU bootup** (BUG #4) — NES: an invalid ROM header causes the CPU's reset vector to point at garbage code; the CPU loops in invalid instruction space and the PPU never generates a complete frame; `update_framebuffer()` returns zeroed pixels, producing a black screen.

3. **ROM length panic** (BUG #1) — NES: the WASM module traps on `Rom::new()`, destroying the emulator instance entirely; the RAF loop never fires a real `runFrame()`; the canvas is never updated.

4. **`getFrameBuffer()` always returns null** (BUG #6) — NES WASM / generic WASM cores: any code path that polls `CoreManager.getFrameBuffer()` and uses it as the sole rendering path receives `null`, producing no pixel output.

---

### Areas That Could Not Be Verified Due to Missing Code

1. **`cores/gb/binjgb.js` and `cores/gb/binjgb.wasm`** — The binjgb WASM binary and its JS glue are present as binary files. The internal WASM execution logic (C source) could not be audited from binary alone. PPU correctness, CPU cycle accuracy, and timer behavior in binjgb cannot be confirmed without source analysis.

2. **`cores/nes-wasm/nes_wasm_bg.wasm` and `nes_wasm.js`** — These are compiled Rust WASM outputs. The `ppu.rs` and `cpu.rs` source files are present and partially audited, but the full PPU scanline rendering pipeline (lines 250–end of `ppu.rs`) and the full CPU instruction execution dispatch were too large for complete analysis. Mapper behavior (`nes-wasm/src/mapper.rs`) and APU logic (`nes-wasm/src/apu.rs`) were not audited.

3. **`cores/jsnes/jsnes.min.js`** — This minified file was not inspected. If it is a stub or empty, `NESCore` (JSNES-based) will always fail to initialize. `NESCore` is not used in the active application, but the file is shipped.

4. **`skins/gameboy.svg`, `skins/gba.svg`, `skins/psp.svg`** — SVG skin files are present but their pixel dimensions and viewBox values relative to the normalized `screen` coordinates in `skin-engine.js` could not be verified. A mismatch between the SVG's internal screen cutout and the `skin.screen` coordinates would cause the game canvas to be positioned incorrectly over the skin image.

5. **`manifest.json`** — The PWA manifest was not audited for correctness of icon paths, display mode, or scope configuration.

---

*This report is diagnostic only. No fixes, recommendations, or code changes are included.*
