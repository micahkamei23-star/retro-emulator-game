/**
 * Renderer
 *
 * Provides a thin safety layer around the canvas drawing pipeline.
 * The actual per-frame rendering is still performed inside each core's
 * runFrame() method — this module centralises the safety checks that
 * prevent black-screen issues after fullscreen transitions.
 */

/**
 * Validate that the canvas is in a drawable state.
 * @param {HTMLCanvasElement} canvas
 * @returns {boolean}
 */
export function isCanvasReady(canvas) {
  if (!canvas) {
    console.warn('[Renderer] Canvas element is null');
    return false;
  }
  if (canvas.width < 1 || canvas.height < 1) {
    console.warn('[Renderer] Canvas dimensions collapsed to 0');
    return false;
  }
  return true;
}

/**
 * Validate that a framebuffer is non-empty.
 * @param {Uint8ClampedArray|null} buffer
 * @returns {boolean}
 */
export function isFrameBufferValid(buffer) {
  if (!buffer || buffer.length === 0) {
    console.warn('[Renderer] Framebuffer is null or empty');
    return false;
  }
  return true;
}

/**
 * Explicitly set the internal resolution of a canvas.
 * CSS scaling is intentionally bypassed.
 * @param {HTMLCanvasElement} canvas
 * @param {number} width
 * @param {number} height
 */
export function setCanvasResolution(canvas, width, height) {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}
