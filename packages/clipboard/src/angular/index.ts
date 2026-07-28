// @symbiote-native/clipboard/angular: the Angular entry over the framework-agnostic core.
// Unlike @symbiote-native/local-auth (all stateless functions, plain re-export), clipboard has
// one listener-based piece — ClipboardService.connect() is the Angular-only lifecycle half; the
// addClipboardListener subscription plumbing all lives in core, shared with React/Vue. Mirrors
// @symbiote-native/sensors' AccelerometerService.

export { ClipboardService } from './services/clipboard.service';
export * from '../core';
