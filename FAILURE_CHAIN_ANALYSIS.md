# RETRO EMULATOR — FAILURE CHAIN ANALYSIS

**Analysis Date:** 2026-03-21
**Type:** Causal failure chain — black screen root cause analysis
**Input bugs:** 12 pre-identified bugs from AUDIT_REPORT.md

This document explains **WHY** the emulator does not render anything — not just **WHAT**
is broken — by tracing how the known bugs interact and cascade at runtime.

---

## SECTION 1 — FAILURE CHAINS

---

### [CHAIN A]  GBA / SNES — All Loads, All ROMs (Bug #3)

**Trigger:** User selects any `.gba` or `.sfc`/`.smc` ROM file.

```
Step 1:  file-input 'change' event fires in rom-loader.js
         detectSystemFromFileName() → { key: 'gba' } or { key: 'snes' }

Step 2:  loader.loadCore('gba') called in emulator-loader.js
         CORE_CONFIG['gba'].createCore(canvas)
         → new WasmCore(canvas, { url: './cores/mgba/mgba.wasm', ... })

Step 3:  WasmCore.init() → fetch('./cores/mgba/mgba.wasm')
         BUG #3: File does not exist in the repository.
         HTTP 404 response: response.ok === false

Step 4:  WasmCore.init() throws:
         Error("Unable to fetch mGBA core at ./cores/mgba/mgba.wasm")

Step 5:  Exception propagates up to the try/catch in setupRomLoader()
         → setStatus('Failed - <filename>')
         → setCoreLabel('Core: None')

Step 6:  core.start() is never reached.
         No requestAnimationFrame loop is ever registered.
         No runFrame() call occurs.
         No render() call occurs.

Step 7:  Canvas retains whatever it last contained.
         At first load: the boot screen drawn by drawBootScreen() (Bug #8).
         At subsequent loads: whichever state a previous failed or successful
         load left the canvas in.
```

**Final Outcome:** Permanent black/boot screen for every GBA and SNES ROM. No frame
of game content is ever rendered. The failure is total and unconditional.

---

### [CHAIN B]  NES — Truncated or Corrupted ROM (Bugs #1 → cascade)

**Trigger:** User selects a `.nes` file whose byte length is less than 16.

```
Step 1:  setupRomLoader() reads file.arrayBuffer() → romBytes (Uint8Array)
         romBytes.length < 16

Step 2:  loader.loadCore('nes') → new NESWasmCore(canvas)
         NESWasmCore.init() imports nes_wasm.js and instantiates WasmNes — succeeds.

Step 3:  loaded.core.loadROM(romBytes) → NESWasmCore.loadROM()
         → this.nes.load_rom(bytes)
         → Rust: WasmNes::load_rom() → Rom::new(data.to_vec())

Step 4:  BUG #1: Rom::new() executes data[0..HEADER_SIZE] where HEADER_SIZE = 16.
         data.len() < 16 → Rust index-out-of-bounds panic.
         WASM module traps; the Rust panic propagates as a JavaScript Error.

Step 5:  loadROM() throws. Exception propagates to setupRomLoader() try/catch.
         → setStatus('Failed - <filename>')

Step 6:  loaded.core.start() is never reached.
         No RAF loop is ever registered. No runFrame(). No render().
```

**Final Outcome:** Black/boot screen. The NES WASM module may be left in an
indeterminate state, making it unsafe for any subsequent use within the same
module instance.

---

### [CHAIN C]  NES — Structurally-Valid File, Wrong Content (Bugs #4 → black pixels)

**Trigger:** User selects a `.nes` file that is ≥ 16 bytes but is NOT a valid NES ROM
(e.g., a renamed text file, a partial download, a ROM for a different system).

```
Step 1:  loader.loadCore('nes') → NESWasmCore.init() — succeeds.

Step 2:  loaded.core.loadROM(romBytes) → this.nes.load_rom(bytes)
         → Rust: Rom::new(data.to_vec())
         data[0..16] sliced without panic (length ≥ 16), header parsed.

Step 3:  BUG #4: WasmNes::load_rom() calls self.nes.bootup() immediately,
         without calling rom.valid() first.
         rom.valid() would have returned false (header signature "NES" + 0x1A
         not present), but that check never runs.

Step 4:  cpu.bootup() reads the CPU reset vector from ROM addresses $FFFC/$FFFD.
         The 16-bit value at those positions in a non-NES file is arbitrary garbage.
         The program counter (PC) is initialized to that garbage address.

Step 5:  loaded.core.start() → setupCanvas() succeeds → RAF loop starts.
         loop() → runFrame() → this.nes.step_frame() runs.
         The CPU begins executing from the garbage PC value.

Step 6:  The CPU steps through invalid opcodes or data bytes as code.
         The PPU state machine receives no valid vblank/nmi signals from a
         meaningful game loop. The PPU's internal tile/pattern/palette tables
         contain zeros or random ROM bytes — no valid tiles are decoded.

Step 7:  this.nes.update_framebuffer() copies the PPU display to framebuffer[].
         PPU display is all zeros (no tiles rendered) → framebuffer is all black.

Step 8:  render(ctx, frame, 256, 240) is called every frame.
         frame.length == 256*240*4 (FRAMEBUFFER_SIZE), all bytes are zero.
         putImageData writes all-black pixels to the offscreen canvas.
         ctx.drawImage(_offscreen, 0, 0) composites black onto the visible canvas.
```

**Final Outcome:** RAF loop runs, render() is called every frame, but every frame is
entirely black. The emulator appears to run but produces no visible output.

---

### [CHAIN D]  Compound Failure — Multi-ROM-Load Scenario
                (Bugs #3 → #8 → canvas state degradation)

**Trigger:** User first attempts a GBA ROM load (fails), then attempts a valid NES load.

```
Step 1:  App starts. main.js DOMContentLoaded fires.
         drawBootScreen() is called — BUG #8:
           canvas.width = 160 (direct, no DPR multiplication)
           canvas.height = 144 (direct, no DPR multiplication)
           canvas.dataset.logicalWidth — NOT written
           canvas.dataset.logicalHeight — NOT written
           ctx.setTransform(dpr, ...) — NOT called
           renderer.js module-level state: _offscreen = null, _imageData = null

Step 2:  User loads GBA ROM → Chain A fires → BUG #3 → fetch 404 → exception.
         The setupRomLoader() catch block runs:
           setStatus('Failed - <filename>')
         No drawBootScreen() call in setupRomLoader's catch (it only sets status).
         BUT in main.js startRom() catch block (lines 137–143):
           drawBootScreen() IS called — BUG #8 fires again.
           canvas.width = 160 — this resets the canvas element, clearing any
           previously applied DPR transform and erasing all pixel data.
           canvas.dataset.logicalWidth — still NOT written.

Step 3:  skin-engine.js positionCanvas() is called by ResizeObserver or by
         setCanvasResolution() / applySkin().
         hasDpr = screen.dataset.logicalWidth && screen.dataset.logicalHeight
               = undefined && undefined = false
         Uses screen.width (160) and screen.height (144) for scale calculations.
         Canvas is positioned as if it is 160×144 logical pixels.

Step 4:  User now loads a valid NES ROM.
         loader.loadCore('nes') → NESWasmCore(canvas)
         NESWasmCore constructor: this.canvas.width = 256, this.canvas.height = 240

Step 5:  loadROM(bytes) — succeeds (valid ROM ≥ 16 bytes, valid iNES header).

Step 6:  core.start() → setupCanvas(this.canvas, this.canvas.width, this.canvas.height)
         = setupCanvas(canvas, 256, 240)
         canvas.width = Math.round(256 * dpr)  — now correct for NES
         canvas.dataset.logicalWidth = 256      — now correctly written
         DPR transform applied via ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
         Offscreen canvas created at 256×240 — renderer state now valid.

Step 7:  RAF loop starts. runFrame() → render() → drawImage → visible frame.
         NES renders correctly from this point.
         BUT: between Step 2 and Step 6, the canvas was in a corrupted state
         (no DPR, no offscreen canvas). Any render() call during that window
         returns early because _offscreen === null (renderer.js line 122).
```

**Final Outcome:** The NES ROM eventually renders after a successful load, but the
compounding effect of Bug #8 means every failed load resets the canvas to a state
that blocks all rendering until the next successful `core.start()`. During the
degraded window (between Step 2 and Step 6), `render()` silently returns at its
`!_offscreen || !_imageData` guard — producing black even if a core were running.

---

### [CHAIN E]  CoreManager Double-Destroy — Latent Cascade (Bug #5)

**Trigger:** User loads ROM #1 successfully, then loads ROM #2 immediately after.

Note: This chain does NOT currently produce a black screen with existing cores.
It is documented because the cascade mechanism is present and creates a latent
risk that becomes active for any future core that removes its null guards.

```
Step 1:  ROM #1 loads, core.start() running, frames rendering.

Step 2:  User selects ROM #2. CoreManager.loadCore('nes') is called.
         CoreManager.unload() runs:
           this.activeCore.destroy()       ← first destroy call
           this.activeCore = null
           this.loader.destroyActive()     ← second destroy call on SAME object
             → this.activeEntry.core.destroy()

Step 3:  For NESWasmCore: first destroy sets this.nes = null.
         Second destroy: if (this.nes) — false — WASM free() skipped. Safe.
         For GBCore: first destroy sets this.module = null.
         Second destroy: if (this.module && this.e) — false. Safe.

Step 4:  New core for ROM #2 created and starts normally.
         No black screen, no visible error.

Latent risk: Any future core implementing destroy() without null guards on its
WASM handles would experience destroy() called twice on the same handle.
The second call would free already-freed memory, triggering undefined behavior
in the WASM runtime — likely a trap, which would prevent the new core from
loading, producing a black screen.
```

**Final Outcome (current):** No black screen — null guards prevent double-free.
**Final Outcome (future cores without null guards):** WASM trap on second destroy
→ module unusable → new core init fails → black screen.

---

## SECTION 2 — ROOT CAUSE ANALYSIS

### Minimum Set Required to Cause Black Screen

The minimum set of bugs **sufficient** to cause a black screen depends on which
ROM system and ROM content the user has:

| Scenario | Minimum Bugs | Black Screen? |
|---|---|---|
| GBA ROM, any content | **#3** alone | YES — unconditional |
| SNES ROM, any content | **#3** alone | YES — unconditional |
| NES ROM, length < 16 bytes | **#1** alone | YES |
| NES ROM, length ≥ 16, invalid header | **#4** alone | YES (black pixels) |
| NES ROM, valid header and content | None of 1–12 | NO — renders correctly |
| GB ROM, valid | None of 1–12 | NO — renders correctly |

**Irreducible minimum for the widest black screen impact: Bug #3.**
A single missing file (two WASM binaries absent) makes two entire systems
completely unusable for all users, all ROMs, with no workaround.

### Bug Dependency Graph

```
Bug #3  ──► Black screen (GBA/SNES) — independent, no dependencies
Bug #1  ──► Black screen (NES, short ROM) — independent
Bug #4  ──► Black screen (NES, invalid ROM) — independent
Bug #8  ──► Canvas degradation after failed load
              └─ depends on Bug #3 (or #1 or #4) to trigger the failed load path
                 that calls drawBootScreen()
              └─ amplified when combined with Bug #3: each failed GBA load
                 resets the canvas, blocking render() until next setupCanvas()
Bug #5  ──► Double destroy — depends on an active core existing (ROM #1 loaded)
              └─ currently safe due to null guards in existing cores
              └─ becomes a black screen risk if future cores lack those guards
Bug #6  ──► getFrameBuffer() returns null — independent of render path
              └─ does NOT affect the in-core RAF render loop (render() is called
                 directly inside runFrame(), not through getFrameBuffer())
              └─ breaks CoreManager.getFrameBuffer() for external callers only
Bug #2  ──► MobileFullscreen constructor crashes — isolated from main.js
              └─ js/mobile-fullscreen.js is never imported by main.js or skin-engine.js
              └─ no effect on rendering pipeline
Bug #7  ──► GameBoyCore.loadROM() null dereference — dead code path
              └─ js/emulators/gb-core.js is NOT imported by emulator-loader.js
              └─ the active GB core is cores/gb/gbCore.js (binjgb), not this file
Bug #9  ──► iOS fullscreen silent fail — affects UI affordance, not rendering
Bug #10 ──► Unused constant — no runtime effect
Bug #11 ──► Debug string typo — no execution effect
Bug #12 ──► startGame() wrong canvas ID — js/start-game-example.js is not imported
              └─ dead code relative to index.html / main.js application flow
```

---

## SECTION 3 — PRIORITY CLASSIFICATION

### TIER 1 — Directly Causes Black Screen

These bugs alone are sufficient to prevent any frame from reaching the canvas.

| Bug | Mechanism | Affected System(s) |
|---|---|---|
| **#3** Missing WASM binaries | `WasmCore.init()` fetch 404 → `core.start()` never called | GBA (all), SNES (all) |
| **#1** ROM constructor panics on short data | WASM trap → `loadROM()` throws → `core.start()` never called | NES (< 16 bytes) |
| **#4** No ROM validity check before boot | CPU boots from garbage PC → PPU produces all-zero framebuffer | NES (valid length, wrong content) |

### TIER 2 — Contributing, Not Independently Sufficient

These bugs worsen the failure but require a Tier 1 bug to be triggered first,
or they degrade rendering quality without completely blocking it.

| Bug | Mechanism | Dependency |
|---|---|---|
| **#8** Boot screen bypasses `setupCanvas()` | `_offscreen = null` after drawBootScreen() → `render()` returns early | Activated by any Tier 1 failure that causes a failed load and re-draws the boot screen |
| **#5** Double destroy | RAF loop cancelled twice, WASM handles freed twice | Requires a prior successful core load; currently harmless due to null guards |
| **#6** `getFrameBuffer()` returns null | Breaks external framebuffer access via CoreManager | Independent but does not affect the in-loop render path; only matters for callers outside the core's own RAF loop |

### TIER 3 — Irrelevant to the Black Screen Failure

These bugs are real defects, but they have no causal path to the canvas
producing black pixels or no pixels.

| Bug | Reason for Irrelevance |
|---|---|
| **#2** MobileFullscreen null `#gameCanvas` | `js/mobile-fullscreen.js` is never imported in `main.js` or `skin-engine.js`; the crash is unreachable from the main application flow |
| **#7** GameBoyCore null `this.gb` dereference | `js/emulators/gb-core.js` is dead code; `emulator-loader.js` imports `cores/gb/gbCore.js` (binjgb), not this file |
| **#9** iOS fullscreen silently fails | Fullscreen is a display-scaling UI feature; not reaching fullscreen does not affect whether pixels are rendered to the canvas |
| **#10** Unused `ANGLE_HYSTERESIS` constant | No execution path references this value; joystick direction detection continues to function (without hysteresis) |
| **#11** ORA debug string typo `"qra"` | `instruction_name()` is only called for debug/disassembly output; the CPU still correctly executes ORA opcodes regardless of the name string |
| **#12** `startGame()` targets `#emulator-screen` | `js/start-game-example.js` is never imported or executed by `main.js`; it is a standalone example file with no connection to the live application |

---

## SECTION 4 — SYSTEM FLOW TRACE

Tracing the actual runtime execution path from app start to canvas render,
identifying the stage at which each Tier 1/2 failure occurs.

```
╔══════════════════════════════════════════════════════════════════════╗
║  STAGE 0 — App Start                                                 ║
╚══════════════════════════════════════════════════════════════════════╝

  index.html loaded by browser
  <script type="module" src="js/main.js"> parsed
  skin-engine.js module executes at parse time:
    applySkin('gameboy') — device image set, hitboxes created
    startLoop()          — skin-engine RAF input loop starts (sends input only)
  main.js DOMContentLoaded callback fires:
    drawBootScreen() called
      ┌─ BUG #8 ACTIVATES HERE ───────────────────────────────────────┐
      │ canvas.width = 160; canvas.height = 144 (raw, no DPR)        │
      │ canvas.dataset.logicalWidth — not written                     │
      │ renderer.js: _offscreen = null, _imageData = null             │
      │ If render() were called now, it returns at line 122:          │
      │   if (!_offscreen || !_imageData) return;  ← black frame      │
      └───────────────────────────────────────────────────────────────┘
    repositionCanvas() → positionCanvas(): hasDpr = false, uses 160×144
    startLoop() called again (skin-engine input loop — no rendering here)

  ► Canvas state after Stage 0:
    - Boot screen text visible (direct ctx.fillRect/fillText in drawBootScreen)
    - DPR transform: NOT applied
    - Offscreen canvas: NULL
    - render() would produce: nothing (early-return guard)

╔══════════════════════════════════════════════════════════════════════╗
║  STAGE 1 — ROM Selection                                             ║
╚══════════════════════════════════════════════════════════════════════╝

  User selects ROM file → 'change' event fires → setupRomLoader callback
  detectSystemFromFileName(file.name) → system key ('nes' / 'gb' / 'gba' / 'snes')

  ┌─ GBA / SNES PATH ──────────────────────────────────────────────────┐
  │  system = 'gba' (or 'snes')                                        │
  │  Proceeds to Stage 2 (GBA/SNES)                                    │
  └────────────────────────────────────────────────────────────────────┘
  ┌─ NES / GB PATH ─────────────────────────────────────────────────────┐
  │  system = 'nes' (or 'gb')                                           │
  │  Proceeds to Stage 2 (NES/GB)                                       │
  └─────────────────────────────────────────────────────────────────────┘

╔══════════════════════════════════════════════════════════════════════╗
║  STAGE 2A — Core Init (GBA / SNES)                                   ║
╚══════════════════════════════════════════════════════════════════════╝

  loader.loadCore('gba') → EmulatorLoader.loadCore()
  destroyActive() — no active core yet, skipped
  config.createCore(canvas) = new WasmCore(canvas, { url: './cores/mgba/mgba.wasm' })
  core.init() → WasmCore.init()
    fetch('./cores/mgba/mgba.wasm')
    ┌─ BUG #3 ACTIVATES HERE ───────────────────────────────────────────┐
    │ HTTP response: 404 Not Found                                      │
    │ response.ok === false                                             │
    │ throw new Error("Unable to fetch mGBA core at ./cores/mgba/...")  │
    └───────────────────────────────────────────────────────────────────┘
  Exception propagates → try/catch in setupRomLoader catches it
  setStatus('Failed - <filename>')

  ► FAILURE AT STAGE 2A.
    Stage 3, 4, 5, 6 are never reached for GBA/SNES.
    Canvas shows boot screen. No game frames ever rendered.

╔══════════════════════════════════════════════════════════════════════╗
║  STAGE 2B — Core Init (NES / GB — valid WASM binaries present)       ║
╚══════════════════════════════════════════════════════════════════════╝

  loader.loadCore('nes') → EmulatorLoader.loadCore()
  destroyActive() — clears any previously active core

  Note on Bug #5: If a previous core was active, CoreManager.unload() was
  called before loadCore(), which calls activeCore.destroy() AND then
  loader.destroyActive() — both calling destroy() on the same object.
  Current null guards prevent any immediate failure here.

  config.createCore(canvas) = new NESWasmCore(canvas)
    this.canvas.width = 256, this.canvas.height = 240 (logical, pre-DPR)
  core.init() → NESWasmCore.init()
    dynamic import('./cores/nes-wasm/nes_wasm.js') — succeeds
    glue.default('./cores/nes-wasm/nes_wasm_bg.wasm') — WASM binary present, succeeds
    new glue.WasmNes() — Rust WasmNes struct allocated
  ► Stage 2B succeeds. Proceeds to Stage 3.

╔══════════════════════════════════════════════════════════════════════╗
║  STAGE 3 — ROM Loading                                               ║
╚══════════════════════════════════════════════════════════════════════╝

  loaded.core.loadROM(romBytes) → NESWasmCore.loadROM()
  this.nes.load_rom(bytes) → Rust WasmNes::load_rom()
    Rom::new(data.to_vec())

  ┌─ PATH A: data.length < 16 ─────────────────────────────────────────┐
  │  BUG #1 ACTIVATES HERE                                              │
  │  data[0..16] panics: index out of bounds                            │
  │  WASM trap → JS Error thrown                                        │
  │  loadROM() throws → setupRomLoader catch → setStatus('Failed')      │
  │  core.start() never called                                          │
  │  ► FAILURE AT STAGE 3 (path A). Stage 4–6 unreached.               │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─ PATH B: data.length ≥ 16, invalid iNES header ────────────────────┐
  │  BUG #4 ACTIVATES HERE                                              │
  │  Rom::new() succeeds (no panic — length guard passed)               │
  │  rom.valid() is never called                                        │
  │  self.nes.bootup() called unconditionally                           │
  │  CPU reads reset vector from $FFFC/$FFFD in garbage ROM data        │
  │  PC initialized to random value                                     │
  │  load_rom() returns without error — JS sees no exception            │
  │  core.start() IS called → proceeds to Stage 4                      │
  │  ► FAILURE DEFERRED TO STAGE 5 (PPU produces black pixels)         │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─ PATH C: data.length ≥ 16, valid iNES header ("NES" + 0x1A) ───────┐
  │  Rom::new() succeeds                                                │
  │  rom.valid() would return true — but is still not called (Bug #4)  │
  │  bootup() proceeds with a ROM that is actually valid                │
  │  CPU reset vector points to valid game code                         │
  │  load_rom() returns successfully                                    │
  │  core.start() IS called → proceeds to Stage 4                      │
  │  ► NO FAILURE AT STAGE 3 (path C). Continues normally.             │
  └─────────────────────────────────────────────────────────────────────┘

╔══════════════════════════════════════════════════════════════════════╗
║  STAGE 4 — Core Start / Canvas Setup                                 ║
╚══════════════════════════════════════════════════════════════════════╝

  (Reached only via Stage 3 Path B or Path C)

  core.start() → EmulatorCoreInterface.start()
  setupCanvas(this.canvas, this.canvas.width, this.canvas.height)
    = setupCanvas(canvas, 256, 240)
    canvas.width  = Math.round(256 * dpr)   ← physical pixel size
    canvas.height = Math.round(240 * dpr)
    canvas.dataset.logicalWidth  = 256      ← written (overrides Bug #8 residue)
    canvas.dataset.logicalHeight = 240
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)  ← DPR transform applied
    _offscreen created at 256×240            ← offscreen canvas initialized
    _imageData created at 256×240           ← pixel buffer initialized
  this.ctx = ctx (context with DPR transform)

  _userHasInteracted check:
    On desktop (user clicked to upload ROM): _userHasInteracted = true
    beginLoop() called immediately
    requestAnimationFrame(loop) registered
  On iOS (before first touch):
    loop deferred until first touchstart/click event (Bug #9 has no effect here)

  ► Stage 4 succeeds. RAF loop is running.

╔══════════════════════════════════════════════════════════════════════╗
║  STAGE 5 — CPU Execution                                             ║
╚══════════════════════════════════════════════════════════════════════╝

  Each RAF tick → loop() → runFrame() → NESWasmCore.runFrame()
  mask = bitmask of current input state
  this.nes.set_buttons(mask) — input routed to Rust
  this.nes.step_frame()      → Rust: Nes::step_frame() → Cpu::step_frame()

  ┌─ PATH B (invalid ROM, Bug #4 triggered in Stage 3) ────────────────┐
  │  CPU's PC holds a garbage value from Step 3 Path B.                │
  │  CPU executes random bytes as opcodes.                              │
  │  Bug #11 (ORA debug typo) has no effect on execution here —        │
  │  instruction_name() is a debug utility only.                       │
  │  PPU state machine cycles but receives no valid game writes.        │
  │  No vblank-timed nametable/palette updates occur.                  │
  │  PPU tile fetch reads from undefined ROM addresses.                 │
  │  ► Proceeds to Stage 6 (Path B) — PPU produces black pixels.       │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─ PATH C (valid ROM) ────────────────────────────────────────────────┐
  │  CPU's PC holds the correct reset vector address.                   │
  │  CPU executes valid game initialization code.                       │
  │  PPU registers (PPUCTRL, PPUMASK, etc.) set up by game code.       │
  │  APU, joypad, mapper state initialized by game ROM.                 │
  │  ► Proceeds to Stage 6 (Path C) — PPU produces valid frames.       │
  └─────────────────────────────────────────────────────────────────────┘

╔══════════════════════════════════════════════════════════════════════╗
║  STAGE 6 — PPU / Framebuffer                                         ║
╚══════════════════════════════════════════════════════════════════════╝

  this.nes.step_frame() completes one full PPU frame (262 scanlines × 341 cycles).

  ┌─ PATH B (invalid ROM, Bug #4 residue) ─────────────────────────────┐
  │  PPU never received valid rendering configuration.                  │
  │  WasmNes::update_framebuffer() → Nes::copy_pixels()                │
  │  → Ppu::get_display().copy_to_rgba_pixels(pixels)                  │
  │  Display buffer was never written with real tile pixel data.        │
  │  All pixels in framebuffer[] remain 0x00 (zero-initialized).       │
  │  framebuffer_ptr() returns pointer to a 256×240×4 block of zeros.  │
  │  ► Proceeds to Stage 7 with all-zero (black) pixel data.           │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─ PATH C (valid ROM) ────────────────────────────────────────────────┐
  │  PPU rendered tiles, sprites, background from valid game data.      │
  │  update_framebuffer() copies real RGBA pixel values into            │
  │  framebuffer[].                                                     │
  │  framebuffer_ptr() returns pointer to valid pixel data.             │
  │  ► Proceeds to Stage 7 with valid, non-black pixel data.           │
  └─────────────────────────────────────────────────────────────────────┘

  Note on Bug #6: NESWasmCore.getFrameBuffer() returns null.
  This is NOT called in the render path here. The framebuffer is passed
  directly from update_framebuffer() → framebuffer_ptr() → Uint8ClampedArray
  inside runFrame() itself, bypassing getFrameBuffer() entirely.
  Bug #6 only breaks CoreManager.getFrameBuffer() for external callers.

╔══════════════════════════════════════════════════════════════════════╗
║  STAGE 7 — Canvas Render                                             ║
╚══════════════════════════════════════════════════════════════════════╝

  Back in NESWasmCore.runFrame() after step_frame() + update_framebuffer():
  const ptr = this.nes.framebuffer_ptr()
  const frame = new Uint8ClampedArray(this.wasm.memory.buffer, ptr, FRAMEBUFFER_SIZE)
  this.ctx.imageSmoothingEnabled = false
  render(this.ctx, frame, 256, 240)

  In renderer.render():
    frame.length = 256*240*4 = 245760 — not zero, passes guard
    _offscreen and _imageData — initialized in Stage 4, not null, pass guard
    actualHeight = 245760 / (256*4) = 240 — matches expectedHeight
    dst.set(frame.subarray(0, dst.length)) — pixel data copied to ImageData

  ┌─ PATH B ───────────────────────────────────────────────────────────┐
  │  All 245760 bytes of frame are 0x00.                               │
  │  _offCtx.putImageData(_imageData, 0, 0) — black pixels on offscreen│
  │  ctx.drawImage(_offscreen, 0, 0) — black pixels on visible canvas  │
  │  ► FINAL OUTCOME: BLACK SCREEN. Every frame renders black.         │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─ PATH C ───────────────────────────────────────────────────────────┐
  │  frame contains valid RGBA game pixel data.                        │
  │  _offCtx.putImageData(_imageData, 0, 0) — game graphics on offscreen│
  │  ctx.drawImage(_offscreen, 0, 0) — game graphics on visible canvas │
  │  ► FINAL OUTCOME: GAME RENDERS CORRECTLY.                          │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## SUMMARY TABLE

| Chain | Bugs Involved | Failure Stage | Outcome |
|---|---|---|---|
| A — GBA/SNES | **#3** | Stage 2A (core init) | RAF loop never starts; black/boot screen |
| B — NES short ROM | **#1** | Stage 3 (ROM load) | WASM trap; RAF never starts; black screen |
| C — NES invalid ROM | **#4** | Stage 3 (deferred to Stage 6) | Loop runs; PPU produces all-zero frame; black pixels |
| D — Multi-load compound | **#3** + **#8** | Stage 2A + boot screen reset | render() returns early; canvas stays black between loads |
| E — Double destroy (latent) | **#5** | Stage 2B (cleanup) | Currently safe; future risk only |

| Bug | Tier | Contribution |
|---|---|---|
| **#3** Missing WASM | TIER 1 | Terminates GBA/SNES loading at fetch; no RAF loop possible |
| **#1** ROM panic | TIER 1 | Terminates NES loading on truncated ROM; WASM traps |
| **#4** No validity check | TIER 1 | Allows NES to boot with garbage PC; PPU produces black |
| **#8** Boot screen bypass | TIER 2 | Corrupts canvas state on failed loads; blocks render() |
| **#5** Double destroy | TIER 2 | Latent risk; currently safe with null guards |
| **#6** getFrameBuffer null | TIER 2 | Breaks external interface; does NOT affect in-loop render |
| **#2** Null #gameCanvas | TIER 3 | Dead to main.js flow; MobileFullscreen not instantiated |
| **#7** Null this.gb | TIER 3 | Dead code; gb-core.js not imported by emulator-loader.js |
| **#9** iOS fullscreen | TIER 3 | No render path involvement |
| **#10** Unused constant | TIER 3 | No runtime effect |
| **#11** ORA typo | TIER 3 | Debug string only; CPU execution unaffected |
| **#12** Wrong canvas ID | TIER 3 | Dead code; start-game-example.js not imported by main.js |

---

*This document is a causal diagnostic analysis only. No fixes, code changes, or
recommendations are included.*
