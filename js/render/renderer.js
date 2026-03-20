/**
 * Renderer
 *
 * Provides the canvas setup and drawing pipeline for all emulator cores.
 *
 * Key guarantees:
 *  - High-DPI (Retina) rendering via devicePixelRatio scaling.
 *  - putImageData is ONLY ever called on the offscreen canvas; the visible
 *    canvas is written via drawImage, which is stable across mobile Safari.
 *  - Framebuffer height mismatches are handled by computing actualHeight from
 *    the buffer length and center-cropping to the expected display height.
 *  - The offscreen canvas and its ImageData are reused across frames to avoid
 *    per-frame large allocations.
 */

/* ── Offscreen canvas state (module-level, reused across frames) ─── */
let _offscreen = null;
let _offCtx    = null;
let _offWidth  = 0;
let _offHeight = 0;
let _imageData = null;

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
 * Set up the visible canvas for high-DPI (Retina) rendering and prepare the
 * shared offscreen canvas used by render().
 *
 * The visible canvas is resized to physical pixel dimensions (width * dpr) so
 * that one canvas pixel maps to one device pixel on HiDPI screens.  The
 * logical CSS size (width × height in CSS pixels) is stored both in
 * canvas.style and in canvas.dataset so that positionCanvas() in skin-engine
 * can compute the correct scale factor without being misled by the inflated
 * canvas.width attribute.
 *
 * @param {HTMLCanvasElement} canvas  The visible <canvas> element.
 * @param {number}            width   Logical width  (game pixels).
 * @param {number}            height  Logical height (game pixels).
 * @returns {{ ctx: CanvasRenderingContext2D, dpr: number }}
 */
export function setupCanvas(canvas, width, height) {
  const dpr = window.devicePixelRatio || 1;

  /* Physical pixel resolution for crisp Retina rendering */
  canvas.width  = Math.round(width  * dpr);
  canvas.height = Math.round(height * dpr);

  /* CSS logical size — skin-engine reads these for scale computation */
  canvas.style.width  = width  + 'px';
  canvas.style.height = height + 'px';

  /* Store logical dimensions so positionCanvas() can stay DPR-aware */
  canvas.dataset.logicalWidth  = width;
  canvas.dataset.logicalHeight = height;

  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  /* Scale the drawing coordinate system so that all core drawing calls use
   * logical (game) pixels — the DPR scale maps them to physical pixels. */
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  /* (Re)create the offscreen canvas only when the logical dimensions change */
  if (_offWidth !== width || _offHeight !== height) {
    _offscreen        = document.createElement('canvas');
    _offscreen.width  = width;
    _offscreen.height = height;
    _offCtx           = _offscreen.getContext('2d', { alpha: false });
    _offCtx.imageSmoothingEnabled = false;
    _offWidth  = width;
    _offHeight = height;
    _imageData = _offCtx.createImageData(width, height);
  }

  return { ctx, dpr };
}

/**
 * Render a raw RGBA framebuffer to the visible canvas via the offscreen canvas.
 *
 * Handles height mismatches by computing the actual frame height from the
 * buffer byte-length (NOT assuming width * expectedHeight * 4) and
 * center-cropping to expectedHeight rows.  putImageData is performed only on
 * the offscreen canvas; the result is composited onto the visible canvas with
 * drawImage, which avoids the putImageData instability seen on mobile Safari.
 *
 * @param {CanvasRenderingContext2D} ctx            Visible canvas 2D context.
 * @param {Uint8ClampedArray}        frame          Raw RGBA pixel data.
 * @param {number}                   width          Frame width in pixels.
 * @param {number}                   expectedHeight Expected display height.
 */
export function render(ctx, frame, width, expectedHeight) {
  if (!frame || frame.length === 0) return;
  if (!_offscreen || !_imageData)   return;

  /* Compute actual height from buffer size — never assume width*height*4 */
  const actualHeight = Math.floor(frame.length / (width * 4));
  if (actualHeight < 1) return;

  const dst = _imageData.data;

  if (actualHeight === expectedHeight) {
    /* Common case: exact match — copy directly */
    dst.set(frame.subarray(0, dst.length));
  } else {
    /* Center-crop: skip leading rows so the middle section is displayed */
    const startRow    = Math.max(0, Math.floor((actualHeight - expectedHeight) / 2));
    const startByte   = startRow * width * 4;
    const rowsToCopy  = Math.min(expectedHeight, actualHeight - startRow);
    const bytesToCopy = rowsToCopy * width * 4;

    /* Zero-fill before copy so partial frames don't leave stale pixels */
    dst.fill(0);
    dst.set(frame.subarray(startByte, startByte + bytesToCopy));
  }

  /* Write pixels to the OFFSCREEN canvas only (avoids Safari instability) */
  _offCtx.putImageData(_imageData, 0, 0);

  /* Composite to the visible canvas — respects the DPR transform from setupCanvas */
  ctx.drawImage(_offscreen, 0, 0);
}
