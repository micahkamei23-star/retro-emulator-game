import EmulatorLoader from './emulator-loader.js';
import Controller from './controller.js';
import StorageManager from './storage.js';

console.log('main.js loaded');

window.onerror = function (message, source, lineno, colno, error) {
  alert(`JS ERROR: ${message} at line ${lineno}`);
};

document.addEventListener('DOMContentLoaded', () => {
  console.log('Retro Emulator loaded');

  const boot = document.getElementById('bootOverlay');
  setTimeout(() => {
    if (boot) boot.remove();
  }, 2000);

  try {
    initApp();
  } catch (e) {
    console.error('Initialization failed:', e);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  console.log('Retro Emulator loaded');
  initApp();
});


window.addEventListener('load', () => {
  const boot = document.getElementById('bootOverlay');
  if (boot) {
    boot.remove();
  }
});

  initApp();
});

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const romInput = document.getElementById('romInput');
const libraryList = document.getElementById('libraryList');
const recentList = document.getElementById('recentList');
const activeSystemLabel = document.getElementById('activeSystem');
const activeCoreLabel = document.getElementById('activeCore');
const activeRomLabel = document.getElementById('activeRom');
const saveStateBtn = document.getElementById('saveStateBtn');
const loadStateBtn = document.getElementById('loadStateBtn');
const clearStateBtn = document.getElementById('clearStateBtn');
const appShell = document.querySelector('.app-shell');
const bootOverlay = document.getElementById('bootOverlay');
const cartridgeOverlay = document.getElementById('cartridgeOverlay');
const cartridgeLabel = document.getElementById('cartridgeLabel');
const startupSoundToggle = document.getElementById('startupSoundToggle');
const exitFullscreenOverlay = document.getElementById('exitFullscreenOverlay');
const exitGameBtn = document.getElementById('exitGameBtn');

const loader = new EmulatorLoader(canvas);
const storage = new StorageManager();
const controllerState = {};
let library = storage.sortLibraryByRecentPlay(storage.getLibrary());
let activeRom = null;
let activeCore = null;
let isLaunchingRom = false;

new Controller(({ control, pressed }) => {
  controllerState[control] = pressed;
  if (activeCore) activeCore.setInput(controllerState);
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const setStatus = (message) => { activeRomLabel.textContent = `ROM: ${message}`; };

const SYSTEM_ASPECT_RATIO = {
  nes: '4 / 3',
  gb: '10 / 9',
  gbc: '10 / 9',
  gba: '3 / 2',
  snes: '4 / 3',
};

const setCanvasAspectRatio = (system) => {
  document.body.style.setProperty('--game-aspect', SYSTEM_ASPECT_RATIO[system] || '4 / 3');
};

async function enterFullscreenMode() {
  if (!document.fullscreenEnabled || document.fullscreenElement) return;

  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch (error) {
    console.warn('Fullscreen request was not granted.', error);
  }
}

async function exitFullscreenMode() {
  if (!document.fullscreenElement) return;
  try {
    await document.exitFullscreen();
  } catch (error) {
    console.warn('Could not exit fullscreen mode.', error);
  }
}

function setGameMode(isActive) {
  document.body.classList.toggle('game-active', isActive);
  appShell.classList.toggle('game-mode', isActive);
  exitFullscreenOverlay.hidden = !isActive;
  exitGameBtn.hidden = !isActive;
  exitFullscreenOverlay.hidden = !isActive;
  exitGameBtn.hidden = !isActive;
function setGameMode(isActive) {
  document.body.classList.toggle('game-active', isActive);
  exitFullscreenOverlay.hidden = !isActive;
  if (activeCore) {
    activeCore.setInput(controllerState);
  }
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setStatus(message) {
  activeRomLabel.textContent = `ROM: ${message}`;
}

function drawBootScreen(message = 'Upload a ROM to start') {
  ctx.fillStyle = '#090909';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#00f5d4';
  ctx.font = '20px "Press Start 2P", monospace';
  ctx.fillText('RETRO EMULATOR', 20, 40);
  ctx.fillStyle = '#f15bb5';
  ctx.font = '14px "Press Start 2P", monospace';
  ctx.font = '20px monospace';
  ctx.fillText('RETRO EMULATOR', 20, 40);
  ctx.fillStyle = '#f15bb5';
  ctx.font = '16px monospace';
  ctx.fillText(message, 20, 72);
}

function createLibraryButton(label, action, romId) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.id = romId;
  return button;
}

function playStartupSound() {
  if (!startupSoundToggle?.checked) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  const audioContext = new AudioCtx();
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(220, now);
  oscillator.frequency.linearRampToValueAtTime(420, now + 0.25);
  oscillator.frequency.linearRampToValueAtTime(520, now + 0.45);

  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.04);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

  oscillator.connect(gainNode).connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.58);
}

async function runStartupSequence() {
  playStartupSound();
  await wait(1500);

  if (!bootOverlay) return;
  bootOverlay.style.opacity = '0';
  bootOverlay.style.transition = 'opacity 0.5s ease';
  appShell?.classList.add('ui-visible');

  await wait(500);
  bootOverlay.remove();
  bootOverlay.style.display = 'none';
}

function hideBootOverlayFallback() {
  if (!bootOverlay) return;
  bootOverlay.style.opacity = '0';
  bootOverlay.style.transition = 'opacity 0.5s ease';
  setTimeout(() => {
    if (bootOverlay.style.display !== 'none') {
      bootOverlay.remove();
      bootOverlay.style.display = 'none';
    }
  }, 500);
}

function initApp() {
  console.log('Retro Emulator starting...');

  renderLibrary();
  drawBootScreen();

  runStartupSequence().catch((error) => {
    console.error('Boot sequence failed, using fallback', error);
    hideBootOverlayFallback();
  });

  setTimeout(() => {
    if (bootOverlay?.style.display !== 'none') {
      hideBootOverlayFallback();
    }
  }, 3000);
}

  await wait(1700);
  bootOverlay.classList.add('fade-out');
  appShell.classList.add('ui-visible');
  await wait(700);
  bootOverlay.style.display = 'none';
}

async function playCartridgeInsert(romName) {
  cartridgeLabel.textContent = `INSERTING ${romName.toUpperCase()}...`;
  cartridgeOverlay.classList.add('is-active');
  await wait(1050);
  cartridgeOverlay.classList.remove('is-active');
}

function renderRecentList() {
  recentList.innerHTML = '';
  const recents = library.slice(0, 3);
  if (!recents.length) return;

  recents.forEach((rom) => {
    const item = document.createElement('li');
    item.className = 'recent-pill';
    item.textContent = `Recent: ${rom.name}`;
    recentList.appendChild(item);
  });
}

function renderLibrary() {
  libraryList.innerHTML = '';
  renderRecentList();

function renderLibrary() {
  libraryList.innerHTML = '';
  if (!library.length) {
    const emptyItem = document.createElement('li');
    emptyItem.textContent = 'No ROMs uploaded yet.';
    libraryList.appendChild(emptyItem);
    return;
  }

  library.forEach((rom) => {
    const item = document.createElement('li');
    item.className = 'library-card';

    const art = rom.boxArt ? document.createElement('img') : document.createElement('div');
    art.className = rom.boxArt ? 'library-art' : 'library-art library-placeholder';
    if (rom.boxArt) {
      art.src = rom.boxArt;
      art.alt = `${rom.name} cover art`;
      art.loading = 'lazy';
    } else {
      art.textContent = rom.systemLabel;
    }

    const meta = document.createElement('div');
    meta.className = 'library-meta';
    item.className = 'library-item';

    const meta = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = rom.name;
    const details = document.createElement('small');
    details.textContent = `${rom.systemLabel} • ${(rom.size / 1024).toFixed(1)} KB`;

    const actions = document.createElement('div');
    actions.className = 'library-actions';
    actions.append(
      createLibraryButton('Play', 'play', rom.id),
      createLibraryButton('Delete', 'delete', rom.id),
    );

    meta.append(title, details, actions);
    item.append(art, meta);
    meta.append(title, document.createElement('br'), details);

    const playButton = createLibraryButton('Play', 'play', rom.id);
    const deleteButton = createLibraryButton('Delete', 'delete', rom.id);
    item.append(meta, playButton, deleteButton);
    libraryList.appendChild(item);
  });
}

async function startRom(rom, romBuffer = null) {
async function startRom(rom) {
  if (isLaunchingRom) return;
  isLaunchingRom = true;

  try {
    setStatus('Loading core...');
    await playCartridgeInsert(rom.name.replace(/\.[^/.]+$/, ''));

    console.log('[ROM] loading core for system:', rom.system);
    const loaded = await loader.loadCore(rom.system);
    if (activeCore && activeCore !== loaded.core) activeCore.stop();

    activeCore = loaded.core;
    console.log('[Core] loaded:', loaded.config.label);
    activeSystemLabel.textContent = `System: ${loaded.systemName}`;
    activeCoreLabel.textContent = `Core: ${loaded.config.label}`;

    const resolvedRomBuffer = romBuffer || StorageManager.dataURLToArrayBuffer(rom.data);
    await activeCore.loadROM(resolvedRomBuffer);
    console.log('[ROM] loaded into core:', rom.name, 'bytes:', resolvedRomBuffer.byteLength);
  try {
    setStatus('Loading core...');
    const loaded = await loader.loadCore(rom.system);

    if (activeCore && activeCore !== loaded.core) {
      activeCore.stop();
    }

    activeCore = loaded.core;
    activeCoreLabel.textContent = `Core: ${loaded.config.label}`;

    const romBuffer = StorageManager.dataURLToArrayBuffer(rom.data);
    await activeCore.loadROM(romBuffer);
    activeCore.setInput(controllerState);
    activeCore.start();

    activeRom = rom;
    library = storage.touchRom(rom.id);
    renderLibrary();
    setStatus(rom.name);
    setCanvasAspectRatio(rom.system);
    setGameMode(true);
    await enterFullscreenMode();
    console.log('[Game] started:', rom.name);
  } catch (error) {
    console.error(error);
    hideBootOverlayFallback();
    setGameMode(true);
  } catch (error) {
    console.error(error);
    drawBootScreen('Core failed to load. Check /cores assets.');
    setStatus(`Failed - ${rom.name}`);
  } finally {
    isLaunchingRom = false;
  }
}

async function stopGameMode() {
function stopGameMode() {
  activeCore?.stop();
  activeCore = null;
  activeRom = null;
  activeSystemLabel.textContent = 'System: None';
  activeCoreLabel.textContent = 'Core: None';
  setStatus('None');
  drawBootScreen();
  setCanvasAspectRatio();
  setGameMode(false);
  await exitFullscreenMode();
  setGameMode(false);
}

romInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  console.log('[ROM] selected:', file.name, `(${file.size} bytes)`);
  const system = loader.resolveSystemByFilename(file.name);
  if (!system) {
    setStatus('Unsupported format');
    romInput.value = '';
    return;
  }

  setStatus('Reading ROM...');

  try {
    const [romBuffer, romDataUrl] = await Promise.all([
      StorageManager.readFileAsArrayBuffer(file),
      StorageManager.fileToBase64(file),
    ]);

    console.log('[ROM] read complete:', file.name);
    console.log('[ROM] detected system:', system);
    const romBuffer = await StorageManager.readFileAsArrayBuffer(file);
    const romDataUrl = StorageManager.arrayBufferToDataURL(romBuffer, file.type || 'application/octet-stream');

    const rom = {
      id: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      system,
      systemLabel: EmulatorLoader.listSystems()[system].label,
      size: file.size,
      data: romDataUrl,
      boxArt: '',
      lastPlayed: new Date().toISOString(),
      addedAt: new Date().toISOString(),
    };

    library = storage.upsertRom(rom);
    console.log('[Library] ROM upserted:', rom.id);
    renderLibrary();
    await startRom(rom, romBuffer);
  } catch (error) {
    console.error('[ROM] failed to process upload', error);
    renderLibrary();
    await startRom(rom, romBuffer);
  } catch (error) {
    console.error(error);
    setStatus(`Failed to read ${file.name}`);
  } finally {
    romInput.value = '';
  }
    return;
  }

  const rom = {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    system,
    systemLabel: EmulatorLoader.listSystems()[system].label,
    size: file.size,
    data: await StorageManager.fileToBase64(file),
    boxArt: '',
    lastPlayed: new Date().toISOString(),
    addedAt: new Date().toISOString(),
  };

  library = storage.upsertRom(rom);
  renderLibrary();
  await startRom(rom);
  romInput.value = '';
});

libraryList.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  const romId = button.dataset.id;
  if (button.dataset.action === 'delete') {
    library = storage.deleteRom(romId);
    if (activeRom?.id === romId) await stopGameMode();
    if (activeRom?.id === romId) stopGameMode();
    if (activeRom?.id === romId) {
      activeRom = null;
      activeCore?.stop();
      activeCore = null;
      activeCoreLabel.textContent = 'Core: None';
      setStatus('None');
      drawBootScreen();
    }
    renderLibrary();
    return;
  }

  const rom = library.find((entry) => entry.id === romId);
  if (rom) await startRom(rom);
});

exitFullscreenOverlay.addEventListener('touchstart', async (event) => {
  event.preventDefault();
  await stopGameMode();
}, { passive: false });
exitFullscreenOverlay.addEventListener('click', () => { stopGameMode(); });
exitGameBtn.addEventListener('click', () => { stopGameMode(); });
exitFullscreenOverlay.addEventListener('touchstart', (event) => {
  event.preventDefault();
  stopGameMode();
}, { passive: false });
exitFullscreenOverlay.addEventListener('click', stopGameMode);

saveStateBtn.addEventListener('click', () => {
  if (!activeRom || !activeCore) return setStatus('Load a ROM first');
  const serializedState = activeCore.serializeState();
  if (!serializedState) return setStatus('Save state not supported by this core');
  if (rom) {
    await startRom(rom);
  }
});

saveStateBtn.addEventListener('click', () => {
  if (!activeRom || !activeCore) {
    setStatus('Load a ROM first');
    return;
  }

  const serializedState = activeCore.serializeState();
  if (!serializedState) {
    setStatus('Save state not supported by this core');
    return;
  }

  storage.saveState(activeRom.id, { serializedState });
  setStatus(`Saved state for ${activeRom.name}`);
});

loadStateBtn.addEventListener('click', () => {
  if (!activeRom || !activeCore) return setStatus('Load a ROM first');
  const state = storage.loadState(activeRom.id);
  if (!state?.serializedState) return setStatus('No save state found');
  if (!activeRom || !activeCore) {
    setStatus('Load a ROM first');
    return;
  }

  const state = storage.loadState(activeRom.id);
  if (!state?.serializedState) {
    setStatus('No save state found');
    return;
  }

  activeCore.loadSerializedState(state.serializedState);
  setStatus(`Loaded state for ${activeRom.name}`);
});

clearStateBtn.addEventListener('click', () => {
  if (!activeRom) return setStatus('Load a ROM first');
  if (!activeRom) {
    setStatus('Load a ROM first');
    return;
  }

  storage.clearState(activeRom.id);
  setStatus(`Cleared state for ${activeRom.name}`);
});

const blockTouchDefaults = (event) => event.preventDefault();
['touchstart', 'touchend', 'touchmove', 'touchcancel'].forEach((eventName) => {
  canvas.addEventListener(eventName, blockTouchDefaults, { passive: false });
  document.body.addEventListener(eventName, blockTouchDefaults, { passive: false });
['touchstart', 'touchend', 'touchmove'].forEach((eventName) => {
  canvas.addEventListener(eventName, blockTouchDefaults, { passive: false });
});

[canvas, document.body].forEach((element) => {
  element.addEventListener('contextmenu', (event) => event.preventDefault());
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js');
      console.log('[SW] registered:', registration.scope);
    } catch (error) {
      console.error('[SW] registration failed', error);
    }
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_UPDATED') {
      console.log('[SW] cache updated to', event.data.version);
    }
  });
}

window.addEventListener('beforeunload', () => loader.unloadAll());
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
}

window.addEventListener('beforeunload', () => loader.unloadAll());
renderLibrary();
drawBootScreen();
runStartupSequence();
