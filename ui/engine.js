/* engine.js - surgical UI engine */
import { skins } from './skins.js';

const root = document.getElementById('emulator-root');
const deviceContainer = document.getElementById('device-container');
const deviceOverlay = document.getElementById('device-overlay');
const mainCanvas = document.getElementById('screen-main');
const secondaryCanvas = document.getElementById('screen-secondary');
const controlsLayer = document.getElementById('controls-layer');
const skinSelect = document.getElementById('skin-select');
const colorAccent = document.getElementById('color-accent');
const controlOpacity = document.getElementById('control-opacity');
const btnFullscreen = document.getElementById('btn-fullscreen');

/* Core pointer - set by integration or by setting window.emuCore */
let core = window.emuCore || null;

/* Input bit mapping (exact numeric mapping) */
export const InputBits = {
  RIGHT: 0, LEFT: 1, UP: 2, DOWN: 3,
  A: 4, B: 5, SELECT: 6, START: 7
};

const inputState = {
  RIGHT:false, LEFT:false, UP:false, DOWN:false,
  A:false, B:false, SELECT:false, START:false
};

/* --- Control creation & placement --- */
function placeControl(el, cfg){
  el.style.position = 'absolute';
  el.style.left = (cfg.x * 100) + '%';
  el.style.top = (cfg.y * 100) + '%';
  el.style.transform = 'translate(-50%,-50%)';
  if (cfg.w) {
    el.style.width = (cfg.w * 100) + '%';
    el.style.height = (cfg.w * 100) + '%';
  }
}

function clearControls(){
  controlsLayer.innerHTML = '';
}

/* Attach quadrant DPAD handlers (exact behavior) */
function attachDPADQuadrantHandler(dpadElement){
  if(!dpadElement) return;
  dpadElement.onpointerdown = function(ev){
    ev.preventDefault();
    const r = dpadElement.getBoundingClientRect();
    const cx = ev.clientX - r.left;
    const cy = ev.clientY - r.top;
    const nx = cx / r.width;
    const ny = cy / r.height;
    const dx = nx - 0.5, dy = ny - 0.5;
    inputState.UP = inputState.DOWN = inputState.LEFT = inputState.RIGHT = false;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) inputState.RIGHT = true; else inputState.LEFT = true;
    } else {
      if (dy > 0) inputState.DOWN = true; else inputState.UP = true;
    }
  };
  dpadElement.onpointerup = dpadElement.onpointercancel = function(ev){
    inputState.UP = inputState.DOWN = inputState.LEFT = inputState.RIGHT = false;
  };
}

/* Map skin control name to inputState key(s) (exact) */
function mapControlNameToInputKey(name){
  switch(name){
    case 'A': return 'A';
    case 'B': return 'B';
    case 'START': return 'START';
    case 'SELECT': return 'SELECT';
    case 'DPAD': return 'DPAD';
    default: return name;
  }
}

/* Create control elements from skin config exactly */
function createControlElements(skinCfg){
  clearControls();
  const controls = skinCfg.controls || {};
  Object.entries(controls).forEach(([name, cfg])=>{
    const el = document.createElement('button');
    el.className = 'emu-control';
    el.dataset.control = name;
    el.setAttribute('aria-label', `Control ${name}`);
    if (name === 'DPAD'){
      el.classList.add('dpad');
      el.innerHTML = '<svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"><rect x="0" y="45" width="100" height="10" rx="6" fill="rgba(0,0,0,0.25)"/><rect x="45" y="0" width="10" height="100" rx="6" fill="rgba(0,0,0,0.25)"/></svg>';
      placeControl(el, cfg);
      controlsLayer.appendChild(el);
      attachDPADQuadrantHandler(el);
      return;
    }
    el.textContent = name;
    placeControl(el, cfg);
    controlsLayer.appendChild(el);

    const setStateOn = (isDown) => {
      const key = mapControlNameToInputKey(name);
      if (!key) return;
      inputState[key] = isDown;
    };

    el.addEventListener('touchstart', (ev)=>{ ev.preventDefault(); setStateOn(true); }, { passive:false });
    el.addEventListener('touchend',   (ev)=>{ ev.preventDefault(); setStateOn(false); }, { passive:false });
    el.addEventListener('touchcancel',(ev)=>{ ev.preventDefault(); setStateOn(false); }, { passive:false });
    el.addEventListener('mousedown',  (ev)=>{ ev.preventDefault(); setStateOn(true); }, { passive:false });
    window.addEventListener('mouseup', (ev)=>{ setStateOn(false); });
  });
}

/* --- Screen placement --- */
function positionScreen(canvasEl, cfg){
  canvasEl.style.position = 'absolute';
  canvasEl.style.left = (cfg.x * 100) + '%';
  canvasEl.style.top = (cfg.y * 100) + '%';
  canvasEl.style.width = (cfg.w * 100) + '%';
  canvasEl.style.height = (cfg.h * 100) + '%';
  canvasEl.style.display = 'block';
}

/* --- Skins apply (live) --- */
function applySkin(name){
  const skin = skins[name];
  if(!skin) { console.error('applySkin: missing', name); return; }
  deviceOverlay.src = skin.overlay;
  if (skin.type === 'single') {
    positionScreen(mainCanvas, skin.screen);
    secondaryCanvas.style.display = 'none';
  } else if (skin.type === 'dual') {
    positionScreen(mainCanvas, skin.screens[0]);
    positionScreen(secondaryCanvas, skin.screens[1]);
    secondaryCanvas.style.display = 'block';
  }
  createControlElements(skin);
  resizeCanvases();
  console.log('Skin applied:', name);
}

/* --- Canvas init/resize (must not recreate canvases) --- */
function resizeCanvases(){
  [mainCanvas, secondaryCanvas].forEach((c)=>{
    if (!c || c.style.display === 'none') return;
    const rect = c.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (ctx) ctx.imageSmoothingEnabled = false;
    }
  });
}

/* If core supports attachCanvas, call it exactly once */
function initCanvases(){
  if (core && typeof core.attachCanvas === 'function') {
    try { core.attachCanvas(mainCanvas, secondaryCanvas); }
    catch(e){ console.warn('core.attachCanvas error', e); }
  }
  resizeCanvases();
  window.addEventListener('resize', resizeCanvases);
}

/* --- Input mask builder & injection --- */
function getInputMask(){
  let mask = 0;
  Object.entries(InputBits).forEach(([k,bit])=>{
    if (inputState[k]) mask |= (1 << bit);
  });
  return mask;
}

function findCoreInputMethod(){
  if (!core) return null;
  if (typeof core.setKeys === 'function') return 'setKeys';
  if (typeof core.setInput === 'function') return 'setInput';
  if (typeof core.joypadSet === 'function') return 'joypadSet';
  return null;
}

function injectInput(mask){
  if (!core) return;
  const method = findCoreInputMethod();
  if (!method) return;
  try {
    core[method](mask);
  } catch(e) {
    console.error('injectInput error', e);
  }
}

/* --- UI Frame loop to inject input per animation frame --- */
let rafId = null;
function uiLoop(){
  try {
    const mask = getInputMask();
    injectInput(mask);
  } catch(e) {
    console.error('uiLoop error', e);
  }
  rafId = requestAnimationFrame(uiLoop);
}
function startUI(){ if (rafId) cancelAnimationFrame(rafId); rafId = requestAnimationFrame(uiLoop); }
function stopUI(){ if (rafId) cancelAnimationFrame(rafId); rafId = null; }

/* --- Fullscreen that MUST NOT reinitialize canvases --- */
async function toggleFullscreen(){
  try {
    if (!document.fullscreenElement) {
      await root.requestFullscreen({navigationUI: 'hide'});
      root.classList.add('fs-root');
    } else {
      await document.exitFullscreen();
      root.classList.remove('fs-root');
    }
    setTimeout(resizeCanvases, 150);
  } catch(e){
    console.warn('toggleFullscreen error', e);
  }
}

/* --- Settings binding & initialization --- */
function populateSkinSelect(){
  Object.keys(skins).forEach(k=>{
    const opt = document.createElement('option'); opt.value = k; opt.textContent = k.toUpperCase();
    skinSelect.appendChild(opt);
  });
}

function bindSettings(){
  populateSkinSelect();
  skinSelect.addEventListener('change', (e)=> applySkin(e.target.value));
  colorAccent.addEventListener('input', (e)=> document.documentElement.style.setProperty('--accent', e.target.value));
  controlOpacity.addEventListener('input', (e)=> document.documentElement.style.setProperty('--control-opacity', e.target.value));
  btnFullscreen.addEventListener('click', toggleFullscreen);
  const defaultSkin = Object.keys(skins)[0]; skinSelect.value = defaultSkin; applySkin(defaultSkin);
}

/* --- Prevent mobile double-tap zoom & page scroll (exact) --- */
(function preventMobileDefaults(){
  let lastTouch = 0;
  document.addEventListener('touchstart', (e)=>{
    const now = Date.now();
    if (now - lastTouch < 300) e.preventDefault();
    lastTouch = now;
  }, { passive:false });
  document.addEventListener('gesturestart', (e)=> e.preventDefault());
})();

/* --- Public API export --- */
export const EmuUI = {
  applySkin,
  startUI,
  stopUI,
  toggleFullscreen,
  setCore: (c) => { core = c; initCanvases(); }
};

/* --- Auto-init --- */
(function init(){
  bindSettings();
  initCanvases();
  startUI();
  console.log('EmuUI initialized');
})();
