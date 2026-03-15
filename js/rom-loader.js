export function detectSystemFromFileName(fileName = '') {
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.gba')) return { key: 'gba', label: 'Game Boy Advance' };
  if (lower.endsWith('.nes')) return { key: 'nes', label: 'NES' };
  if (lower.endsWith('.sfc') || lower.endsWith('.smc')) return { key: 'snes', label: 'SNES' };
  if (lower.endsWith('.gb')) return { key: 'gb', label: 'Game Boy' };

  return null;
}

export function setupRomLoader({
  romInput,
  loader,
  getCurrentCore,
  setCurrentCore,
  getControllerState,
  onStarted,
  setStatus,
  setSystemLabel,
  setCoreLabel,
  setRomLabel,
}) {
  if (!romInput) return;

  romInput.addEventListener('change', async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;

    console.log('ROM selected', file.name);

    const detected = detectSystemFromFileName(file.name);
    if (!detected) {
      setStatus?.('Unsupported format');
      setSystemLabel?.('System: None');
      setCoreLabel?.('Core: None');
      setRomLabel?.(`ROM: ${file.name}`);
      romInput.value = '';
      return;
    }

    console.log('System detected:', detected.label);
    setSystemLabel?.(`System: ${detected.label}`);
    setCoreLabel?.('Core: Loading...');
    setRomLabel?.(`ROM: ${file.name}`);
    setStatus?.('Reading ROM...');

    try {
      const romBuffer = await file.arrayBuffer();
      const romBytes = new Uint8Array(romBuffer);
      console.log('ROM buffer loaded', romBytes.length);

      const loaded = await loader.loadCore(detected.key);
      console.log('Core loaded', loaded.config.label);

      const currentCore = getCurrentCore?.();
      if (currentCore && currentCore !== loaded.core) currentCore.stop();

      await loaded.core.loadROM(romBytes);
      loaded.core.setInput(getControllerState?.() || {});

      console.log('Starting emulator');
      loaded.core.start();

      setCurrentCore?.(loaded.core);
      setSystemLabel?.(`System: ${loaded.systemName}`);
      setCoreLabel?.(`Core: ${loaded.config.label}`);
      setRomLabel?.(`ROM: ${file.name}`);

      onStarted?.({
        file,
        system: detected.key,
        loaded,
      });
    } catch (error) {
      console.error('[ROM] failed to boot', error);
      setStatus?.(`Failed - ${file.name}`);
      setCoreLabel?.('Core: None');
    } finally {
      romInput.value = '';
    }
  });
}
