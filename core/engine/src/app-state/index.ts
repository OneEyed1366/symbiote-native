// AppState module: reports whether the app is foreground/background/inactive and
// notifies on change, memory warnings, and (iOS) focus/blur. Native emits the
// device events `appStateDidChange` ({ app_state }), `memoryWarning`, and
// `appStateFocusChange` (boolean) through the device hub; this subscribes via a
// NativeEventEmitter bound to the AppState native module and maps them onto the
// public 'change'/'memoryWarning'/'focus'/'blur' listeners, mirroring RN's
// Libraries/AppState/AppState.js.

import { createDeviceEventModule } from '../native-modules';
import {
  type IEventEmitterModule,
  type IEventSubscription,
} from '../native-events';
import { dlog } from '../debug';

// The native module name RN registers AppState under, confirmed from its spec
// (specs_DEPRECATED/modules/INativeAppState.js, `TurboModuleRegistry.getEnforcing('AppState')`).
const APP_STATE_MODULE = 'AppState';

// The device events native emits. RN's NativeAppStateEventDefinitions.
const NATIVE_EVENT = {
  stateDidChange: 'appStateDidChange',
  focusChange: 'appStateFocusChange',
  memoryWarning: 'memoryWarning',
} as const;

// The public event names callers subscribe to. RN's IAppStateEvent.
const APP_STATE_EVENT = {
  change: 'change',
  memoryWarning: 'memoryWarning',
  focus: 'focus',
  blur: 'blur',
} as const;

export type IAppStateStatus =
  'inactive' | 'background' | 'active' | 'extension' | 'unknown';
export type IAppStateEvent =
  (typeof APP_STATE_EVENT)[keyof typeof APP_STATE_EVENT];

// The AppState native module: constants, the live-state query, and the observe-counters.
interface INativeAppState extends IEventEmitterModule {
  getConstants(): { initialAppState: string };
  getCurrentAppState(
    onSuccess: (data: { app_state: string }) => void,
    onError: (error: unknown) => void,
  ): void;
  addListener(eventType: string): void;
  removeListeners(count: number): void;
}

// `appStateData.app_state`, read the way RN reads it: no shape check, `undefined` when absent,
// and a TypeError on a null payload as the property read would throw.
function appStateOf(payload: unknown): string | undefined {
  if (payload === null || payload === undefined) {
    throw new TypeError(
      `Cannot read property 'app_state' of ${String(payload)}`,
    );
  }
  const state: unknown = Reflect.get(Object(payload), 'app_state');
  return typeof state === 'string' ? state : undefined;
}

// `null` until the module resolves (or when it is not linked), as RN's field starts.
let currentState: string | null | undefined = null;

// AppState.js's constructor, run once when the emitter is built: seed from the constant, keep it
// fresh from 'appStateDidChange', and ask native for the live state — which wins, and is
// re-emitted to listeners, unless an event arrived first.
const deviceEventModule = createDeviceEventModule<INativeAppState>({
  moduleName: APP_STATE_MODULE,
  moduleLogPrefix: 'AppState: module',
  onEmitterCreated: (emitter, module) => {
    if (module === null) return;
    currentState = module.getConstants().initialAppState;
    let eventUpdated = false;
    emitter.addListener(NATIVE_EVENT.stateDidChange, payload => {
      eventUpdated = true;
      currentState = appStateOf(payload);
      dlog(
        `AppState: ${NATIVE_EVENT.stateDidChange} -> ${String(currentState)}`,
      );
    });
    module.getCurrentAppState(
      data => {
        if (!eventUpdated && currentState !== data.app_state) {
          currentState = data.app_state;
          emitter.emit(NATIVE_EVENT.stateDidChange, data);
        }
      },
      error => dlog(`AppState.getCurrentAppState failed: ${String(error)}`),
    );
  },
});

function getModule(): INativeAppState | null {
  return deviceEventModule.getModule();
}

function getEmitter() {
  return deviceEventModule.getEmitter();
}

class AppStateImpl {
  // Feature-detect: true when the native AppState module resolved, false when it
  // isn't linked. RN exposes the same field so callers can guard before subscribing.
  get isAvailable(): boolean {
    return getModule() !== null;
  }

  // The current foreground/background state, populated from getConstants and kept
  // fresh by the change observer. Null until the module resolves (or never linked).
  get currentState(): string | null | undefined {
    getEmitter();
    return currentState;
  }

  // Subscribe to an AppState event, mapped onto the native `appStateDidChange` /
  // `memoryWarning` / `appStateFocusChange`. Throws, as RN does, without a module or for an
  // event it does not know.
  addEventListener(
    type: IAppStateEvent,
    handler: (...args: unknown[]) => void,
  ): IEventSubscription {
    if (getModule() === null) {
      throw new Error('Cannot use AppState when `isAvailable` is false.');
    }
    const eventEmitter = getEmitter();
    dlog(`AppState.addEventListener -> ${type}`);
    switch (type) {
      case APP_STATE_EVENT.change:
        return eventEmitter.addListener(NATIVE_EVENT.stateDidChange, payload =>
          handler(appStateOf(payload)),
        );
      case APP_STATE_EVENT.memoryWarning:
        return eventEmitter.addListener(NATIVE_EVENT.memoryWarning, () =>
          handler(),
        );
      case APP_STATE_EVENT.focus:
        return eventEmitter.addListener(NATIVE_EVENT.focusChange, hasFocus => {
          if (hasFocus) handler();
        });
      case APP_STATE_EVENT.blur:
        return eventEmitter.addListener(NATIVE_EVENT.focusChange, hasFocus => {
          if (!hasFocus) handler();
        });
    }
    throw new Error(`Trying to subscribe to unknown event: ${String(type)}`);
  }
}

export const AppState = new AppStateImpl();
