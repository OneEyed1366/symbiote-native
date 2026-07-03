// Keyboard moved to @symbiote-native/engine (a framework-agnostic device-state module re-exported
// by every adapter). This thin re-export keeps @symbiote-native/react's public surface identical.
export { Keyboard, KEYBOARD_EVENT } from '@symbiote-native/engine';
export type { IKeyboardEventName, IKeyboardEvent, IKeyboardMetrics } from '@symbiote-native/engine';
