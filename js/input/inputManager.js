/**
 * Input Manager
 *
 * Re-exports the Controller class as the unified input manager.
 * Maintains a single shared input state object that can be routed
 * to any active emulator core without coupling input logic to a
 * specific core.
 */

export { default as Controller } from '../controller.js';
