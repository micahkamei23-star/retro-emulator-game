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

const loader = new EmulatorLoader();
const storage = new StorageManager();
let library = storage.getLibrary();
let activeRom = null;
const player = { x: 40, y: 40, speed: 4, color: '#00f5d4' };

function setStatus(message) {
  activeRomLabel.textContent = `ROM: ${message}`;
}

function createLibraryButton(label, action, romId) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.id = romId;
  return button;
}

new Controller(({ control, pressed }) => {
  if (!pressed) return;
  if (control === 'left') player.x -= player.speed;
  if (control === 'right') player.x += player.speed;
  if (control === 'up') player.y -= player.speed;
  if (control === 'down') player.y += player.speed;
  player.x = Math.max(0, Math.min(canvas.width - 32, player.x));
  player.y = Math.max(0, Math.min(canvas.height - 32, player.y));
  renderFrame();
});

function renderFrame() {
  ctx.fillStyle = '#090909';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#271849';
  for (let i = 0; i < canvas.width; i += 32) {
    for (let j = 0; j < canvas.height; j += 32) {
      if ((i + j) % 64 === 0) ctx.fillRect(i, j, 32, 32);
    }
  }

  ctx.fillStyle = player.color;
  ctx.fillRect(player.x, player.y, 32, 32);
  ctx.fillStyle = '#f15bb5';
  ctx.font = '16px monospace';
  const promptText = activeRom ? `${activeRom.name} • ${activeRom.systemLabel}` : 'Upload a ROM to start';
  ctx.fillText(promptText, 16, 24);
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
  activeRom = rom;
  const loaded = await loader.loadCore(rom.system);

  if (loaded.type === 'mock') {
    activeCoreLabel.textContent = `Core: ${loaded.config.label} (mock)`;
    setStatus(`${rom.name} (core unavailable, demo mode)`);
  } else {
    activeCoreLabel.textContent = `Core: ${loaded.config.label} (wasm)`;
    setStatus(rom.name);
  }

  storage.touchRom(rom.id);
  renderFrame();
}

romInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  const system = loader.resolveSystemByFilename(file.name);
  if (!system) {
    setStatus('Unsupported format');
    return;
  }

  setStatus('Reading ROM...');
  const romData = await StorageManager.fileToBase64(file);

  const rom = {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    system,
    systemLabel: EmulatorLoader.listSystems()[system].label,
    size: file.size,
    data: romData,
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
      activeCoreLabel.textContent = 'Core: None';
      setStatus('None');
    }
    renderLibrary();
    renderFrame();
    return;
  }

  const rom = library.find((entry) => entry.id === romId);
  if (rom) {
    await startRom(rom);
  }
});

saveStateBtn.addEventListener('click', () => {
  if (!activeRom) {
    setStatus('Load a ROM first');
    return;
  }
  storage.saveState(activeRom.id, { player, romName: activeRom.name });
  setStatus(`Saved state for ${activeRom.name}`);
});

loadStateBtn.addEventListener('click', () => {
  if (!activeRom) {
    setStatus('Load a ROM first');
    return;
  }

  const state = storage.loadState(activeRom.id);
  if (!state) {
    setStatus('No save state found');
    return;
  }

  Object.assign(player, state.player || {});
  renderFrame();
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

library = storage.sortLibraryByRecentPlay(library);
renderLibrary();
renderFrame();
