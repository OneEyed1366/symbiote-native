// KeepAwakeService is the Angular-only lifecycle half; the free functions and event
// subscription plumbing all live in core, shared with React/Vue.
export { KeepAwakeService } from './services/keep-awake.service';
export {
  ExpoKeepAwakeTag,
  isAvailableAsync,
  activateKeepAwakeAsync,
  deactivateKeepAwake,
  addListener,
  type KeepAwakeEvent,
  type KeepAwakeListener,
  type KeepAwakeOptions,
  type EventSubscription,
} from '../core';
