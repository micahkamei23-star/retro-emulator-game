import EmulatorLoader from './emulator-loader.js';
import Controller from './controller.js';
import StorageManager from './storage.js';
import { setupRomLoader } from './rom-loader.js';

const SYSTEM_ASPECT_RATIO = {
  nes: '4 / 3',
  gb: '10 / 9',
  gbc: '10 / 9',
  gba: '3 / 2',
  snes: '4 / 3',
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

document.addEventListener('DOMContentLoaded', () => {
  // ─── Element refs ────────────────────────────────────────────────────────────
  const canvas              = document.getElementById('gameCanvas');
  const ctx                 = canvas.getContext('2d');
  const romUploadInput      = document.getElementById('rom-upload');
  const uploadButton        = document.getElementById('upload-btn');
  const libraryList         = document.getElementById('libraryList');
  const recentList          = document.getElementById('recentList');
  const activeSystemLabel   = document.getElementById('activeSystem');
  const activeCoreLabel     = document.getElementById('activeCore');
  const activeRomLabel      = document.getElementById('activeRom');
  const saveStateBtn        = document.getElementById('saveStateBtn');
  const loadStateBtn        = document.getElementById('loadStateBtn');
  const clearStateBtn       = document.getElementById('clearStateBtn');
  const appShell            = document.querySelector('.app-shell');
  const cartridgeOverlay    = document.getElementById('cartridgeOverlay');
  const cartridgeLabel      = document.getElementById('cartridgeLabel');
  const exitFullscreenOverlay = document.getElementById('exitFullscreenOverlay');
  const exitGameBtn         = document.getElementById('exitGameBtn');
  const libraryToggleBtn    = document.getElementById('libraryToggleBtn');
  const libraryDrawer       = document.getElementById('libraryDrawer');

  // ─── Core state ──────────────────────────────────────────────────────────────
  const loader          = new EmulatorLoader(canvas);
  const storage         = new StorageManager();
  const controllerState = {};
  let   library         = storage.sortLibraryByRecentPlay(storage.getLibrary());
  let   activeRom       = null;
  let   activeCore      = null;
  let   isLaunching     = false;
  let   exitOverlayVisible = false;

  // ─── Controller ──────────────────────────────────────────────────────────────
  new Controller(({ control, pressed }) => {
    controllerState[control] = pressed;
    if (activeCore) activeCore.setInput(controllerState);
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const setStatus = (msg) => { activeRomLabel.textContent = `ROM: ${msg}`; };

  const setCanvasAspectRatio = (system) => {
    document.body.style.setProperty(
      '--game-aspect',
      SYSTEM_ASPECT_RATIO[system] || '4 / 3',
    );
  };

  function setGameMode(active) {
    document.body.classList.toggle('game-active', active);
    appShell.classList.toggle('game-mode', active);
    exitOverlayVisible = false;
    exitFullscreenOverlay.hidden = true;
    exitGameBtn.hidden           = !active;
  }

  function drawBootScreen(message = 'Upload a ROM to start') {
    ctx.fillStyle = '#090909';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00f5d4';
    ctx.font      = '20px monospace';
    ctx.fillText('RETRO EMULATOR', 20, 40);
    ctx.fillStyle = '#f15bb5';
    ctx.font      = '16px monospace';
    ctx.fillText(message, 20, 72);
  }

  async function enterFullscreen() {
    if (!document.fullscreenEnabled || document.fullscreenElement) return;
    try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); }
    catch { /* user gesture may be required */ }
  }

  async function exitFullscreen() {
    if (!document.fullscreenElement) return;
    try { await document.exitFullscreen(); } catch { /* ignore */ }
  }

  async function playCartridgeInsert(romName) {
    cartridgeLabel.textContent = `INSERTING ${romName.toUpperCase()}...`;
    cartridgeOverlay.classList.add('is-active');
    await wait(1050);
    cartridgeOverlay.classList.remove('is-active');
  }

  function playStartupSound() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      const ctx2 = new AudioCtx();
      const now   = ctx2.currentTime;
      const osc   = ctx2.createOscillator();
      const gain  = ctx2.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(520, now + 0.45);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08,   now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      osc.connect(gain).connect(ctx2.destination);
      osc.start(now);
      osc.stop(now + 0.58);
    } catch { /* autoplay blocked — ignore */ }
  }

  // ─── Library rendering ───────────────────────────────────────────────────────
  function renderRecentList() {
    recentList.innerHTML = '';
    library.slice(0, 3).forEach((rom) => {
      const li = document.createElement('li');
      li.className   = 'recent-pill';
      li.textContent = `Recent: ${rom.name}`;
      recentList.appendChild(li);
    });
  }

  function createLibraryButton(label, action, romId) {
    const btn = document.createElement('button');
    btn.type            = 'button';
    btn.textContent     = label;
    btn.dataset.action  = action;
    btn.dataset.id      = romId;
    return btn;
  }

  function renderLibrary() {
    libraryList.innerHTML = '';
    renderRecentList();

    if (!library.length) {
      const li = document.createElement('li');
      li.textContent = 'No ROMs uploaded yet.';
      libraryList.appendChild(li);
      return;
    }

    library.forEach((rom) => {
      const li  = document.createElement('li');
      li.className = 'library-card';

      const art = rom.boxArt ? document.createElement('img') : document.createElement('div');
      art.className = rom.boxArt ? 'library-art' : 'library-art library-placeholder';
      if (rom.boxArt) { art.src = rom.boxArt; art.alt = `${rom.name} cover art`; art.loading = 'lazy'; }
      else            { art.textContent = rom.systemLabel; }

      const meta    = document.createElement('div');
      meta.className = 'library-meta';
      const title   = document.createElement('strong');
      title.textContent = rom.name;
      const details = document.createElement('small');
      details.textContent = `${rom.systemLabel} • ${(rom.size / 1024).toFixed(1)} KB`;
      const actions = document.createElement('div');
      actions.className = 'library-actions';
      actions.append(createLibraryButton('Play', 'play', rom.id), createLibraryButton('Delete', 'delete', rom.id));

      meta.append(title, details, actions);
      li.append(art, meta);
      libraryList.appendChild(li);
    });
  }

  // ─── Game lifecycle ───────────────────────────────────────────────────────────
  async function startRom(rom, romBuffer = null) {
    if (isLaunching) return;
    isLaunching = true;
    try {
      setStatus('Loading core...');
      await playCartridgeInsert(rom.name.replace(/\.[^/.]+$/, ''));
      playStartupSound();

      // loadCore() destroys any previously active core before creating a new one
      activeCore = null;
      const loaded = await loader.loadCore(rom.system);
      activeCore = loaded.core;

      activeSystemLabel.textContent = `System: ${loaded.systemName}`;
      activeCoreLabel.textContent   = `Core: ${loaded.config.label}`;

      // Resolve ROM bytes — fresh buffer, passed buffer, or IndexedDB
      let bytes;
      if (romBuffer instanceof Uint8Array) {
        bytes = romBuffer;
      } else if (romBuffer) {
        bytes = new Uint8Array(romBuffer);
      } else {
        // Load from IndexedDB (primary) or fall back to legacy data URL
        const stored = await storage.loadRomData(rom.id);
        if (stored?.data) {
          bytes = new Uint8Array(stored.data);
          console.log('ROM loaded from storage', bytes.length);
        } else if (rom.data) {
          bytes = new Uint8Array(StorageManager.dataURLToArrayBuffer(rom.data));
        }
      }

      if (!bytes || bytes.length < 16) {
        console.error('Invalid ROM');
        setStatus(`Invalid ROM — ${rom.name}`);
        setGameMode(false);
        return;
      }

      console.log('Passing to emulator');
      await activeCore.loadROM(bytes);
      activeCore.setInput(controllerState);
      activeCore.start();

      activeRom = rom;
      library   = storage.touchRom(rom.id);
      renderLibrary();
      setStatus(rom.name);
      setCanvasAspectRatio(rom.system);
      setGameMode(true);
      await enterFullscreen();
    } catch (err) {
      console.error('[startRom]', err);
      drawBootScreen('Core failed to load. Check /cores assets.');
      setStatus(`Failed — ${rom.name}`);
      setGameMode(false);
    } finally {
      isLaunching = false;
    }
  }

  async function stopGame() {
    const system = activeRom?.system;
    if (system) loader.unloadCore(system);
    activeCore = null;
    activeRom  = null;
    // Reset controller state so stale input doesn't carry over
    Object.keys(controllerState).forEach((key) => { controllerState[key] = false; });
    activeSystemLabel.textContent = 'System: None';
    activeCoreLabel.textContent   = 'Core: None';
    setStatus('None');
    drawBootScreen();
    setCanvasAspectRatio();
    setGameMode(false);
    await exitFullscreen();
  }

  // ─── ROM upload (via setupRomLoader) ─────────────────────────────────────────
  setupRomLoader({
    romInput:           romUploadInput,
    loader,
    getCurrentCore:     ()     => activeCore,
    setCurrentCore:     (core) => { activeCore = core; },
    getControllerState: ()     => controllerState,
    setStatus,
    setSystemLabel: (text) => { activeSystemLabel.textContent = text; },
    setCoreLabel:   (text) => { activeCoreLabel.textContent   = text; },
    setRomLabel:    (text) => { activeRomLabel.textContent    = text; },
    onStarted: async ({ file, system, loaded }) => {
      const romId = `${file.name}-${file.size}-${file.lastModified}`;
      activeRom  = { id: romId, name: file.name, system, systemLabel: system.toUpperCase(), size: file.size };
      activeCore = loaded.core;
      library    = storage.upsertRom(activeRom);

      // Persist ROM data to IndexedDB so it survives refresh
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        console.log('ROM uploaded', bytes.length);
        await storage.saveRomData(romId, file.name, system, buffer);
      } catch (err) {
        console.error('[storage] failed to persist ROM data', err);
      }

      renderLibrary();
      setStatus(file.name);
      setCanvasAspectRatio(system);
      setGameMode(true);
      enterFullscreen();
    },
  });

  // ─── Upload button ────────────────────────────────────────────────────────────
  // The <label for="rom-upload"> in index.html already activates the hidden
  // file input via the HTML `for` association.  Adding a programmatic
  // `.click()` here as well would open the file picker twice and is known to
  // fail on iOS Safari, so the redundant handler is intentionally omitted.

  // ─── Library toggle ───────────────────────────────────────────────────────────
  libraryToggleBtn?.addEventListener('click', () => {
    const isHidden = libraryDrawer?.hidden;
    if (libraryDrawer) libraryDrawer.hidden = !isHidden;
    libraryToggleBtn.textContent = isHidden ? 'Game Library ▲' : 'Game Library ▼';
  });

  // ─── Library clicks ───────────────────────────────────────────────────────────
  libraryList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const romId = btn.dataset.id;
    if (btn.dataset.action === 'delete') {
      library = storage.deleteRom(romId);
      if (activeRom?.id === romId) await stopGame();
      renderLibrary();
      return;
    }
    const rom = library.find((r) => r.id === romId);
    if (rom) await startRom(rom);
  });

  // ─── Exit game ────────────────────────────────────────────────────────────────
  exitFullscreenOverlay.addEventListener('touchstart', async (e) => { e.preventDefault(); await stopGame(); }, { passive: false });
  exitFullscreenOverlay.addEventListener('click', () => stopGame());
  exitGameBtn.addEventListener('click', () => stopGame());

  // ─── Exit overlay toggle (tap canvas to show/hide) ────────────────────────────
  canvas.addEventListener('click', () => {
    if (!activeCore) return;
    exitOverlayVisible = !exitOverlayVisible;
    exitFullscreenOverlay.hidden = !exitOverlayVisible;
  });
  canvas.addEventListener('touchend', (e) => {
    if (!activeCore) return;
    e.preventDefault();
    exitOverlayVisible = !exitOverlayVisible;
    exitFullscreenOverlay.hidden = !exitOverlayVisible;
  }, { passive: false });

  // ─── Save / Load / Clear state ────────────────────────────────────────────────
  saveStateBtn.addEventListener('click', () => {
    if (!activeRom || !activeCore) return setStatus('Load a ROM first');
    const s = activeCore.serializeState();
    if (!s) return setStatus('Save state not supported by this core');
    storage.saveState(activeRom.id, { serializedState: s });
    setStatus(`Saved state for ${activeRom.name}`);
  });

  loadStateBtn.addEventListener('click', () => {
    if (!activeRom || !activeCore) return setStatus('Load a ROM first');
    const saved = storage.loadState(activeRom.id);
    if (!saved?.serializedState) return setStatus('No save state found');
    activeCore.loadSerializedState(saved.serializedState);
    setStatus(`Loaded state for ${activeRom.name}`);
  });

  clearStateBtn.addEventListener('click', () => {
    if (!activeRom) return setStatus('Load a ROM first');
    storage.clearState(activeRom.id);
    setStatus(`Cleared state for ${activeRom.name}`);
  });

  // ─── Touch / context-menu passthrough block ───────────────────────────────────
  // Only prevent default on the canvas itself; applying it to document.body
  // would swallow the synthesised click that iOS Safari generates for the
  // "Upload ROM" label, preventing the file picker from ever opening.
  ['touchstart', 'touchend', 'touchmove', 'touchcancel'].forEach((ev) => {
    canvas.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  });
  [canvas, document.body].forEach((el) => el.addEventListener('contextmenu', (e) => e.preventDefault()));

  // ─── Service Worker ───────────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('./service-worker.js');
        console.log('[SW] registered:', reg.scope);
      } catch (err) {
        console.error('[SW] registration failed', err);
      }
    });
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'SW_UPDATED') console.log('[SW] updated to', e.data.version);
    });
  }

  // ─── Cleanup on unload ────────────────────────────────────────────────────────
  window.addEventListener('beforeunload', () => loader.unloadAll());

  // ─── Startup sound on first user gesture ─────────────────────────────────────
  const onFirstGesture = () => playStartupSound();
  document.addEventListener('click', onFirstGesture, { once: true });
  document.addEventListener('touchstart', onFirstGesture, { once: true });

  // ─── Initial render ───────────────────────────────────────────────────────────
  renderLibrary();
  drawBootScreen();
});