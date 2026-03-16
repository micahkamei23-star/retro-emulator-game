# Emulator Core Assets

These binary files are **not committed** to the repository due to licensing and file-size constraints.
You must download or build them yourself and place them at the exact paths below.

---

## Required folder structure

```
cores/
├── jsnes/
│   └── jsnes.min.js        ← NES emulator (jsnes)
├── gameboy/
│   └── gameboy.min.js      ← Game Boy / Color emulator
├── mgba/
│   └── mgba.wasm           ← Game Boy Advance emulator (mGBA WASM)
└── snes9x/
    └── snes9x.wasm         ← SNES emulator (Snes9x WASM)
```

---

## NES — jsnes (`cores/jsnes/jsnes.min.js`)

**Source:** https://github.com/bfirsh/jsnes

### Option A — Download pre-built (recommended)

1. Go to https://www.npmjs.com/package/jsnes
2. Click "Code" → download the tarball, or run:
   ```
   npm pack jsnes
   ```
3. Extract it. Inside `package/dist/` you will find `jsnes.min.js`.
4. Copy it to `cores/jsnes/jsnes.min.js`.

### Option B — Build from source

```bash
git clone https://github.com/bfirsh/jsnes.git
cd jsnes
npm install
npm run build
cp dist/jsnes.min.js ../cores/jsnes/jsnes.min.js
```

### Verify

The file must expose a global `window.jsnes.NES` constructor (UMD build).
Open your browser console after loading a `.nes` ROM — you should see:
```
ROM selected <filename>
System detected: NES
ROM buffer loaded
```
