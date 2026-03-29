# Full Codebase Diagnostic Report

## Scope and method
- Scanned all repository files (`rg --files`) and manually reviewed source/config assets.
- Ran JavaScript syntax checks with `node --check` on every `.js` file.
- Ran static integrity checks for import targets, core asset presence, HTML duplicate IDs, and CSS brace balance.
- Loaded the app in Chromium via Playwright against a local HTTP server to capture startup console/page errors.

## High-impact blockers

1. **Emulator core runtime assets are missing from disk**
   - Referenced paths: `cores/jsnes/jsnes.min.js`, `cores/gameboy/gameboy.min.js`, `cores/mgba/mgba.wasm`, `cores/snes9x/snes9x.wasm`.
   - These are required by loader/core init paths and service-worker pre-cache lists.
   - Impact: any ROM boot attempt fails when core loading begins (script/wasm fetch failure).
   - Suggested fix: provide these files in the expected paths (or adjust paths and deployment packaging).

2. **`js/main.js` contains duplicated/corrupted boot flow blocks**
   - Multiple nested `DOMContentLoaded` registrations at top of file.
   - `setupRomLoader({...})` call site is interleaved with duplicated `bootRomFromFile`, duplicated `stopGameMode`, duplicated `romUploadInput` listeners, and repeated variable declarations.
   - Impact: fragile control flow, duplicate event handlers, and non-deterministic ROM launch behavior; maintenance/debugging is severely impaired.
   - Suggested fix: rewrite `main.js` boot path into a single authoritative ROM-start pipeline and one upload listener.

3. **CSS file has structural syntax issues (unbalanced braces / orphan declarations)**
   - Extra `}` and one unclosed `{` were detected; there are stray declarations outside selector blocks.
   - Impact: parser error recovery causes later rules to be ignored or misapplied, leading to broken UI/layout and possibly hidden controls.
   - Suggested fix: repair malformed blocks and de-duplicate repeated rule groups.

4. **Duplicate `id="rom-upload"` in HTML**
   - Two file inputs share the same ID.
   - Impact: `getElementById('rom-upload')` resolves to the first node only; second input is effectively detached from JS logic and can introduce inconsistent behavior.
   - Suggested fix: keep one input, or assign unique IDs and wire both intentionally.

## Functional flow tracing

### Startup to emulator render path
1. `index.html` loads `js/main.js` as module.
2. `main.js` initializes UI/controllers and creates `EmulatorLoader` and `StorageManager`.
3. ROM upload should trigger `setupRomLoader` (`js/rom-loader.js`) and/or local file-change handlers in `main.js`.
4. ROM bytes are read (`File.arrayBuffer()`), converted to `Uint8Array`, then passed into `loader.loadCore(system)` and `core.loadROM(...)`.
5. On successful core load, `core.start()` invokes the per-core `runFrame()` loop via `requestAnimationFrame` from `EmulatorCoreInterface.start()`.
6. Rendering:
   - NES: `nes.frame()` populates `onFrame` buffer -> `putImageData`.
   - GB: emulator callback `onFrame(frame)` -> `imageData.data.set(...)`/conversion -> `putImageData`.
   - WASM cores: `frame()` -> `get_frame_ptr/get_frame_size` -> `imageData.data.set(framebuffer)` -> `putImageData`.

### Where execution fails when emulator does not render
- Primary failure point in this repo snapshot: missing core assets on disk (fetch/load failures during `init()`/`loadScript()`).
- Secondary reliability risk: corrupted/duplicated launch orchestration in `main.js` may attach overlapping listeners and conflicting ROM launch logic.

## ROM pipeline validation (requested chain)
Requested chain: `file upload -> ArrayBuffer -> Uint8Array -> emulator.loadROM()`

- Implemented in `setupRomLoader`:
  - file input `change`
  - `await file.arrayBuffer()`
  - `new Uint8Array(romBuffer)`
  - `await loaded.core.loadROM(romBytes)`
- Also duplicated in `main.js` with overlapping handlers.
- Status: **logic exists**, but real execution is blocked by missing core assets and complicated by duplicated handlers.

## Render pipeline validation (requested chain)
Requested chain: `emulator.runFrame() -> onFrame(framebuffer) -> imageData.data.set(framebuffer) -> ctx.putImageData()`

- GB core follows this pattern directly via `onFrame(frame)` and `runFrame()` render commit.
- WASM core follows equivalent path (`frame` + framebuffer pointer/size copy + `putImageData`).
- NES core uses jsnes `onFrame` conversion loop into RGBA buffer, then `putImageData` in `runFrame()`.
- Status: pipeline is present in each core implementation.

## Additional problems and risks
- `playStartupSound()` exists but is never called.
- `start-game-example.js` exports a separate runtime path using `#emulator-screen`, which does not exist in `index.html`; this file appears unused and can confuse maintainers.
- `WasmCore` does not explicitly set canvas intrinsic `width/height` to core resolution, unlike `GameBoyCore`; rendering can appear letterboxed/small depending on canvas state.
- Service worker caches core assets that are absent; offline install succeeds but emulator functionality still fails at runtime.

## Console/runtime observations
- Initial page load in Playwright produced a 404 resource error (non-blocking for module bootstrap), and no immediate uncaught JS exception at idle.
- No ROM boot test could succeed in this environment because required core binaries/scripts are not present in repository.

## Recommended remediation order
1. Restore/provision all required core assets in expected `cores/*` paths.
2. Refactor `js/main.js` to one clean ROM boot path (single `DOMContentLoaded`, single upload listener, single `stopGameMode`/`bootRomFromFile`).
3. Fix CSS syntax structure and remove duplicated/partial rule fragments.
4. Remove duplicate `rom-upload` element ID.
5. Add automated checks:
   - JS linting (`eslint`) and formatting
   - CSS linting (`stylelint`)
   - A smoke test that boots app shell and verifies one upload listener is attached.
