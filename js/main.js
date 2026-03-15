import EmulatorLoader from './emulator-loader.js';
import Controller from './controller.js';
import StorageManager from './storage.js';

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

function setGameMode(isActive) {
  document.body.classList.toggle('game-active', isActive);
  exitFullscreenOverlay.hidden = !isActive;
}

function drawBootScreen(message = 'Upload a ROM to start') {
  ctx.fillStyle = '#090909';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#00f5d4';
  ctx.font = '20px "Press Start 2P", monospace';
  ctx.fillText('RETRO EMULATOR', 20, 40);
  ctx.fillStyle = '#f15bb5';
  ctx.font = '14px "Press Start 2P", monospace';
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
    libraryList.appendChild(item);
  });
}

async function startRom(rom) {
  if (isLaunchingRom) return;
  isLaunchingRom = true;

  try {
    setStatus('Loading core...');
    await playCartridgeInsert(rom.name.replace(/\.[^/.]+$/, ''));

    const loaded = await loader.loadCore(rom.system);
    if (activeCore && activeCore !== loaded.core) activeCore.stop();

    activeCore = loaded.core;
    activeSystemLabel.textContent = `System: ${loaded.systemName}`;
    activeCoreLabel.textContent = `Core: ${loaded.config.label}`;

    const romBuffer = StorageManager.dataURLToArrayBuffer(rom.data);
    await activeCore.loadROM(romBuffer);
    activeCore.setInput(controllerState);
    activeCore.start();

    activeRom = rom;
    library = storage.touchRom(rom.id);
    renderLibrary();
    setStatus(rom.name);
    setGameMode(true);
  } catch (error) {
    console.error(error);
    drawBootScreen('Core failed to load. Check /cores assets.');
    setStatus(`Failed - ${rom.name}`);
  } finally {
    isLaunchingRom = false;
  }
}

function stopGameMode() {
  activeCore?.stop();
  activeCore = null;
  activeRom = null;
  activeSystemLabel.textContent = 'System: None';
  activeCoreLabel.textContent = 'Core: None';
  setStatus('None');
  drawBootScreen();
  setGameMode(false);
}

romInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  const system = loader.resolveSystemByFilename(file.name);
  if (!system) {
    setStatus('Unsupported format');
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
    if (activeRom?.id === romId) stopGameMode();
    renderLibrary();
    return;
  }

  const rom = library.find((entry) => entry.id === romId);
  if (rom) await startRom(rom);
});

exitFullscreenOverlay.addEventListener('touchstart', (event) => {
  event.preventDefault();
  stopGameMode();
}, { passive: false });
exitFullscreenOverlay.addEventListener('click', stopGameMode);

saveStateBtn.addEventListener('click', () => {
  if (!activeRom || !activeCore) return setStatus('Load a ROM first');
  const serializedState = activeCore.serializeState();
  if (!serializedState) return setStatus('Save state not supported by this core');
  storage.saveState(activeRom.id, { serializedState });
  setStatus(`Saved state for ${activeRom.name}`);
});

loadStateBtn.addEventListener('click', () => {
  if (!activeRom || !activeCore) return setStatus('Load a ROM first');
  const state = storage.loadState(activeRom.id);
  if (!state?.serializedState) return setStatus('No save state found');
  activeCore.loadSerializedState(state.serializedState);
  setStatus(`Loaded state for ${activeRom.name}`);
});

clearStateBtn.addEventListener('click', () => {
  if (!activeRom) return setStatus('Load a ROM first');
  storage.clearState(activeRom.id);
  setStatus(`Cleared state for ${activeRom.name}`);
});

const blockTouchDefaults = (event) => event.preventDefault();
['touchstart', 'touchend', 'touchmove', 'touchcancel'].forEach((eventName) => {
  canvas.addEventListener(eventName, blockTouchDefaults, { passive: false });
  document.body.addEventListener(eventName, blockTouchDefaults, { passive: false });
});

[canvas, document.body].forEach((element) => {
  element.addEventListener('contextmenu', (event) => event.preventDefault());
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
}

window.addEventListener('beforeunload', () => loader.unloadAll());
renderLibrary();
drawBootScreen();
runStartupSequence();
