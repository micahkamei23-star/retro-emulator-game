const ROM_LIBRARY_KEY = 'retro-rom-library-v1';
const SAVE_STATE_KEY = 'retro-save-states-v1';

class StorageManager {
  getLibrary() {
    return JSON.parse(localStorage.getItem(ROM_LIBRARY_KEY) || '[]');
  }

  saveLibrary(library) {
    localStorage.setItem(ROM_LIBRARY_KEY, JSON.stringify(library));
  }

  upsertRom(rom) {
    const library = this.getLibrary();
    const existingIndex = library.findIndex((entry) => entry.id === rom.id);
    if (existingIndex >= 0) {
      library[existingIndex] = rom;
    } else {
      library.push(rom);
    }
    this.saveLibrary(library);
    return library;
  }

  deleteRom(id) {
    const next = this.getLibrary().filter((entry) => entry.id !== id);
    this.saveLibrary(next);
    return next;
  }

  saveState(romId, state) {
    const allStates = JSON.parse(localStorage.getItem(SAVE_STATE_KEY) || '{}');
    allStates[romId] = { ...state, savedAt: new Date().toISOString() };
    localStorage.setItem(SAVE_STATE_KEY, JSON.stringify(allStates));
  }

  loadState(romId) {
    const allStates = JSON.parse(localStorage.getItem(SAVE_STATE_KEY) || '{}');
    return allStates[romId] || null;
  }

  clearState(romId) {
    const allStates = JSON.parse(localStorage.getItem(SAVE_STATE_KEY) || '{}');
    delete allStates[romId];
    localStorage.setItem(SAVE_STATE_KEY, JSON.stringify(allStates));
  }
}

export default StorageManager;
