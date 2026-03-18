/**
 * Joystick Module
 *
 * Re-exports joystick constants and the MobileFullscreen class
 * which contains the joystick implementation.
 *
 * The joystick uses a configurable deadzone (default 18px) and
 * hysteresis-based direction detection to prevent flickering
 * between adjacent directions.
 */

export { default as MobileFullscreen } from '../mobile-fullscreen.js';

/** Minimum pixel distance before the joystick registers a direction. */
export const DEADZONE = 18;

/** Maximum visual travel radius of the joystick thumb. */
export const JOYSTICK_MAX_RADIUS = 48;
