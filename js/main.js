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
  ctx.fillText(activeRom ? activeRom.name : 'Upload a ROM to start', 16, 24);
}

function renderLibrary() {
  libraryList.innerHTML = '';
  if (!library.length) {
    libraryList.innerHTML = '<li>No ROMs uploaded yet.</li>';
    return;
  }

  library.forEach((rom) => {
    const item = document.createElement('li');
    item.className = 'library-item';
    item.innerHTML = `
      <span>${rom.name}<br/><small>${rom.systemLabel}</small></span>
      <button data-action="play" data-id="${rom.id}">Play</button>
      <button data-action="delete" data-id="${rom.id}">Delete</button>
    `;
    libraryList.appendChild(item);
  });
}

async function startRom(rom) {
  activeRom = rom;
  const loaded = await loader.loadCore(rom.system);
  activeCoreLabel.textContent = `Core: ${loaded.config.label} (${loaded.type})`;
  activeRomLabel.textContent = `ROM: ${rom.name}`;
  renderFrame();
}

romInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  const system = loader.resolveSystemByFilename(file.name);
  if (!system) {
    alert('Unsupported ROM format. Use NES, SNES, GB, or GBA ROM files.');
    return;
  }

  const rom = {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    system,
    systemLabel: EmulatorLoader.listSystems()[system].label,
    size: file.size,
    lastPlayed: new Date().toISOString(),
  };

  library = storage.upsertRom(rom);
  renderLibrary();
  await startRom(rom);
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
      activeRomLabel.textContent = 'ROM: None';
    }
    renderLibrary();
    renderFrame();
    return;
  }

  const rom = library.find((entry) => entry.id === romId);
  if (rom) await startRom(rom);
});

saveStateBtn.addEventListener('click', () => {
  if (!activeRom) return alert('Load a ROM first.');
  storage.saveState(activeRom.id, { player });
});

loadStateBtn.addEventListener('click', () => {
  if (!activeRom) return alert('Load a ROM first.');
  const state = storage.loadState(activeRom.id);
  if (!state) return alert('No saved state found.');
  Object.assign(player, state.player || {});
  renderFrame();
});

clearStateBtn.addEventListener('click', () => {
  if (!activeRom) return alert('Load a ROM first.');
  storage.clearState(activeRom.id);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
}

renderLibrary();
renderFrame();
