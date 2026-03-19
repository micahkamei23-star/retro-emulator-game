/**
 * main.js — Emulator orchestrator
 *
 * Integrates the skin-engine rendering system with:
 *  - EmulatorLoader  (WASM core loading)
 *  - StorageManager  (ROM persistence + save states)
 *  - setupRomLoader  (file-input ROM detection)
 *
 * The skin-engine handles ALL input and canvas positioning.
 * This file handles ROM lifecycle and utility bar actions only.
 */

import EmulatorLoader from './emulator-loader.js';
import StorageManager from './storage.js';
import { setupRomLoader } from './rom-loader.js';
import {
  applySkin,
  nextSkin,
  prevSkin,
  setCore,
  startLoop,
  toggleFullscreen,
} from './skin-engine.js';

/* ── System → canvas resolution ─────────────────────────────── */
const SYSTEM_RESOLUTION = {
  nes:  [256, 240],
  gb:   [160, 144],
  gbc:  [160, 144],
  gba:  [240, 160],
  snes: [256, 224],
};

/* ── System → preferred skin ────────────────────────────────── */
const SYSTEM_SKIN = {
  nes:  'gameboy',
  gb:   'gameboy',
  gbc:  'gameboy',
  gba:  'gba',
  snes: 'psp',
};

document.addEventListener('DOMContentLoaded', () => {
  /* ── DOM refs ─────────────────────────────────────────────── */
  const canvas       = document.getElementById('screen');
  const romUpload    = document.getElementById('rom-upload');
  const prevSkinBtn  = document.getElementById('prev-skin');
  const nextSkinBtn  = document.getElementById('next-skin');
  const fsBtn        = document.getElementById('fullscreen-btn');
  const saveStateBtn = document.getElementById('save-state-btn');
  const loadStateBtn = document.getElementById('load-state-btn');
  const statusText   = document.getElementById('status-text');

  /* ── Core state ───────────────────────────────────────────── */
  const loader  = new EmulatorLoader(canvas);
  const storage = new StorageManager();
  let   activeCore = null;
  let   activeRom  = null;
  let   isLaunching = false;

  /* ── Helpers ──────────────────────────────────────────────── */
  function setStatus(msg) {
    if (statusText) statusText.textContent = msg;
  }

  function setCanvasResolution(system) {
    const res = SYSTEM_RESOLUTION[system];
    if (!res) return;
    if (canvas.width  !== res[0]) canvas.width  = res[0];
    if (canvas.height !== res[1]) canvas.height = res[1];
  }

  function drawBootScreen() {
    /* Draw a minimal boot screen on the canvas */
    canvas.width  = 160;
    canvas.height = 144;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#090909';
    ctx.fillRect(0, 0, 160, 144);
    ctx.fillStyle = '#00f5d4';
    ctx.font = '10px monospace';
    ctx.fillText('RETRO EMULATOR', 8, 30);
    ctx.fillStyle = '#f15bb5';
    ctx.font = '7px monospace';
    ctx.fillText('Upload a ROM to start', 8, 50);
  }

  /* ── ROM lifecycle ────────────────────────────────────────── */
  async function startRom(rom, romBuffer = null) {
    if (isLaunching) return;
    isLaunching = true;
    try {
      setStatus('Loading...');
      activeCore = null;
      setCore(null);

      const loaded = await loader.loadCore(rom.system);
      activeCore = loaded.core;
      setCore(activeCore);

      /* Resolve ROM bytes */
      let bytes;
      if (romBuffer instanceof Uint8Array) {
        bytes = romBuffer;
      } else if (romBuffer) {
        bytes = new Uint8Array(romBuffer);
      } else {
        const stored = await storage.loadRomData(rom.id);
        if (stored?.data) {
          bytes = new Uint8Array(stored.data);
        } else if (rom.data) {
          bytes = new Uint8Array(StorageManager.dataURLToArrayBuffer(rom.data));
        }
      }

      if (!bytes || bytes.length < 16) {
        setStatus('Invalid ROM data');
        drawBootScreen();
        return;
      }

      await activeCore.loadROM(bytes);
      activeCore.start();

      activeRom = rom;
      setCanvasResolution(rom.system);
      applySkin(SYSTEM_SKIN[rom.system] || 'gameboy');
      setStatus(rom.name);

      storage.touchRom(rom.id);
    } catch (err) {
      console.error('[main] startRom failed:', err);
      setStatus('Failed: ' + rom.name);
      drawBootScreen();
      activeCore = null;
      setCore(null);
    } finally {
      isLaunching = false;
    }
  }

  /* ── ROM upload via setupRomLoader ────────────────────────── */
  setupRomLoader({
    romInput:           romUpload,
    loader,
    getCurrentCore:     ()    => activeCore,
    setCurrentCore:     (c)   => { activeCore = c; setCore(c); },
    /* Controller state is managed by skin-engine — pass empty object */
    getControllerState: ()    => ({}),
    setStatus,
    setSystemLabel:     ()    => {},
    setCoreLabel:       ()    => {},
    setRomLabel:        (txt) => setStatus(txt),
    onStarted: async ({ file, system, loaded }) => {
      const romId = `${file.name}-${file.size}-${file.lastModified}`;
      activeRom   = {
        id:          romId,
        name:        file.name,
        system,
        systemLabel: system.toUpperCase(),
        size:        file.size,
      };
      activeCore = loaded.core;
      setCore(activeCore);

      /* Persist to IndexedDB for library re-launch */
      try {
        const buffer = await file.arrayBuffer();
        await storage.saveRomData(romId, file.name, system, buffer);
      } catch (e) {
        console.warn('[main] ROM persist failed:', e);
      }

      storage.upsertRom(activeRom);
      setCanvasResolution(system);
      applySkin(SYSTEM_SKIN[system] || 'gameboy');
      setStatus(file.name);
    },
  });

  /* ── Utility bar actions ──────────────────────────────────── */
  prevSkinBtn?.addEventListener('click',  prevSkin);
  nextSkinBtn?.addEventListener('click',  nextSkin);
  fsBtn?.addEventListener('click',        toggleFullscreen);

  saveStateBtn?.addEventListener('click', () => {
    if (!activeRom || !activeCore) return setStatus('No ROM loaded');
    const state = activeCore.serializeState?.();
    if (!state) return setStatus('Save state not supported');
    storage.saveState(activeRom.id, { serializedState: state });
    setStatus('State saved');
  });

  loadStateBtn?.addEventListener('click', () => {
    if (!activeRom || !activeCore) return setStatus('No ROM loaded');
    const saved = storage.loadState(activeRom.id);
    if (!saved?.serializedState) return setStatus('No saved state');
    activeCore.loadSerializedState?.(saved.serializedState);
    setStatus('State loaded');
  });

  /* ── Service Worker ───────────────────────────────────────── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('./service-worker.js');
        console.log('[SW] registered:', reg.scope);
      } catch (e) {
        console.error('[SW] registration failed:', e);
      }
    });
  }

  /* ── Cleanup on unload ────────────────────────────────────── */
  window.addEventListener('beforeunload', () => loader.unloadAll());

  /* ── Initial boot screen ──────────────────────────────────── */
  drawBootScreen();
  startLoop();
});
