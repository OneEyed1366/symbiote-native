// AppState moved to @symbiote-native/engine (a framework-agnostic device-state module re-exported
// by every adapter). This thin re-export keeps @symbiote-native/react's public surface identical.
export { AppState } from '@symbiote-native/engine';
export type { IAppStateStatus, IAppStateEvent } from '@symbiote-native/engine';
