import EmulatorLoader from './emulator-loader.js';
import Controller from './controller.js';
import StorageManager from './storage.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const romInput = document.getElementById('romInput');
const libraryList = document.getElementById('libraryList');
const activeCoreLabel = document.getElementById('activeCore');
const activeRomLabel = document.getElementById('activeRom');
const saveStateBtn = document.getElementById('saveStateBtn');
const loadStateBtn = document.getElementById('loadStateBtn');
const clearStateBtn = document.getElementById('clearStateBtn');

const loader = new EmulatorLoader(canvas);
const storage = new StorageManager();
const controllerState = {};
let library = storage.sortLibraryByRecentPlay(storage.getLibrary());
let activeRom = null;
let activeCore = null;

new Controller(({ control, pressed }) => {
  controllerState[control] = pressed;
  if (activeCore) {
    activeCore.setInput(controllerState);
  }
});

function setStatus(message) {
  activeRomLabel.textContent = `ROM: ${message}`;
}

function drawBootScreen(message = 'Upload a ROM to start') {
  ctx.fillStyle = '#090909';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#00f5d4';
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
    item.className = 'library-item';

    const meta = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = rom.name;
    const details = document.createElement('small');
    details.textContent = `${rom.systemLabel} • ${(rom.size / 1024).toFixed(1)} KB`;
    meta.append(title, document.createElement('br'), details);

    const playButton = createLibraryButton('Play', 'play', rom.id);
    const deleteButton = createLibraryButton('Delete', 'delete', rom.id);
    item.append(meta, playButton, deleteButton);
    libraryList.appendChild(item);
  });
}

async function startRom(rom) {
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
  } catch (error) {
    console.error(error);
    drawBootScreen('Core failed to load. Check /cores assets.');
    setStatus(`Failed - ${rom.name}`);
  }
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
  if (!activeRom) {
    setStatus('Load a ROM first');
    return;
  }

  storage.clearState(activeRom.id);
  setStatus(`Cleared state for ${activeRom.name}`);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
}

window.addEventListener('beforeunload', () => loader.unloadAll());
renderLibrary();
drawBootScreen();
