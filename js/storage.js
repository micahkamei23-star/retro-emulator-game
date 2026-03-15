const ROM_LIBRARY_KEY = 'retro-rom-library-v1';
const SAVE_STATE_KEY = 'retro-save-states-v1';

class StorageManager {
  static fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read ROM file.'));
      reader.readAsDataURL(file);
    });
  }


  static readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read ROM file as ArrayBuffer.'));
      reader.readAsArrayBuffer(file);
    });
  }

  static arrayBufferToDataURL(buffer, mimeType = 'application/octet-stream') {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, offset + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return `data:${mimeType};base64,${btoa(binary)}`;
  }

  static dataURLToArrayBuffer(dataUrl) {
    const base64 = dataUrl.split(',')[1] || '';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  getLibrary() {
    return JSON.parse(localStorage.getItem(ROM_LIBRARY_KEY) || '[]');
  }

  saveLibrary(library) {
    localStorage.setItem(ROM_LIBRARY_KEY, JSON.stringify(library));
  }

  sortLibraryByRecentPlay(library) {
    return [...library].sort((a, b) => new Date(b.lastPlayed || 0) - new Date(a.lastPlayed || 0));
  }

  upsertRom(rom) {
    const library = this.getLibrary();
    const existingIndex = library.findIndex((entry) => entry.id === rom.id);
    const nextLibrary = [...library];

    if (existingIndex >= 0) {
      nextLibrary[existingIndex] = { ...nextLibrary[existingIndex], ...rom };
    } else {
      nextLibrary.push(rom);
    }

    const sorted = this.sortLibraryByRecentPlay(nextLibrary);
    this.saveLibrary(sorted);
    return sorted;
  }

  touchRom(id) {
    const library = this.getLibrary();
    const nextLibrary = library.map((entry) => (entry.id === id
      ? { ...entry, lastPlayed: new Date().toISOString() }
      : entry));
    const sorted = this.sortLibraryByRecentPlay(nextLibrary);
    this.saveLibrary(sorted);
    return sorted;
  }

  deleteRom(id) {
    const next = this.getLibrary().filter((entry) => entry.id !== id);
    this.saveLibrary(next);
    this.clearState(id);
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
