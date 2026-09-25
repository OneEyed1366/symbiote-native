// native -> JS: receiving native module events, all under one callable JS module name. A real
// host already owns that name, so a second registration is a no-op — the app injects RN's
// DeviceEventEmitter instead via setDeviceEventSource; below is the fallback for headless runs.

import { dlog } from './debug';
import { runWrapped } from './dispatch';
import { invariant } from './invariant';

// Bridgeless host hooks. `RN$registerCallableModule(name, factory)` exposes a JS
// module the native side can call; `RN$Bridgeless` confirms we are on the new
// runtime. Typed here at the trust boundary, like the other JSI globals.
declare global {
  var RN$registerCallableModule:
    | ((
        name: string,
        factory: () => {
          emit: (eventType: string, ...args: unknown[]) => void;
        },
      ) => void)
    | undefined;

  var RN$Bridgeless: boolean | undefined;
}

type IDeviceListener = (...args: unknown[]) => void;

export interface IEventSubscription {
  remove(): void;
}

// The single device-event bus. Native pushes into `emit`; subscribers (wrapped by
// NativeEventEmitter) live in `listeners`, keyed by event name.
const listeners = new Map<string, Set<IDeviceListener>>();

function emit(eventType: string, ...args: unknown[]): void {
  const set = listeners.get(eventType);
  // Diagnostic: proves native is calling OUR hub (vs RN's own RCTDeviceEventEmitter).
  dlog(`device hub emit "${eventType}" -> ${set?.size ?? 0} listener(s)`);
  if (set === undefined) return;
  // Route through the shared dispatch wrapper so a listener's setState flushes on the sync
  // lane, the same seam Fabric touch events use. Snapshot first: a listener may remove
  // itself mid-dispatch.
  const snapshot = [...set];
  runWrapped(() => {
    for (const listener of snapshot) listener(...args);
  });
}

function addRawListener(eventType: string, listener: IDeviceListener): void {
  let set = listeners.get(eventType);
  if (set === undefined) {
    set = new Set();
    listeners.set(eventType, set);
  }
  set.add(listener);
}

function removeRawListener(eventType: string, listener: IDeviceListener): void {
  listeners.get(eventType)?.delete(listener);
}

let installed = false;

// Register the hub so native can deliver events. Call once at bootstrap, after the
// host is up (alongside binding the Fabric slot). Idempotent.
export function installDeviceEventHub(): void {
  // A host bus was injected: it owns delivery; the fallback hub is unused. (On a
  // real host our registration would be a no-op anyway: native's emplace ignores
  // the already-registered RCTDeviceEventEmitter key.)
  if (installed || injectedSource !== undefined) return;
  const register = globalThis.RN$registerCallableModule;
  if (register === undefined) {
    throw new Error(
      'RN$registerCallableModule is not installed on the global. ' +
        'Native events need a bridgeless (New Architecture) host.',
    );
  }
  register('RCTDeviceEventEmitter', () => ({ emit }));
  installed = true;
  dlog('device event hub installed (RCTDeviceEventEmitter)');
}

// The host event bus the app injects: RN's DeviceEventEmitter, the JS module
// native actually invokes. Its `addListener` returns a removable subscription.
export interface IDeviceEventSource {
  addListener(
    eventType: string,
    listener: (payload: unknown) => void,
  ): IEventSubscription;
  // RN's DeviceEventEmitter has these; NativeEventEmitter.removeAllListeners / emit use them.
  removeAllListeners?(eventType: string): void;
  listenerCount?(eventType: string): number;
  emit?(eventType: string, ...args: unknown[]): void;
}

let injectedSource: IDeviceEventSource | undefined;

// Inject the host's device-event bus (e.g. RN's DeviceEventEmitter). Once set,
// NativeEventEmitter subscribes through it instead of the built-in fallback hub.
// Called by the app at bootstrap, where importing the host bus is allowed.
export function setDeviceEventSource(source: IDeviceEventSource): void {
  injectedSource = source;
}

// A module that emits events tells native when JS starts/stops observing via these
// counters, so native can lazily begin/end its own observation. Optional: a plain
// device event (no owning module) needs none.
export interface IEventEmitterModule {
  addListener(eventType: string): void;
  removeListeners(count: number): void;
}

// The payload native emitted, untyped at this boundary: shared can't know an event's shape,
// so the listener gets `unknown` and the consumer narrows with a runtime guard, same as
// FabricEventHandler's raw native event.
export type INativeEventListener = (payload: unknown) => void;

// True only when the module carries both observe-counter methods. A spec that omits
// addListener/removeListeners leaves them undefined, so calling through would throw —
// the guard here protects the module, not a missing method. Mirrors RN's constructor probe.
function hasObserveCounters(module: IEventEmitterModule): boolean {
  return (
    typeof module.addListener === 'function' &&
    typeof module.removeListeners === 'function'
  );
}

// Subscribe to events for one native module. Mirrors RN's NativeEventEmitter: each
// `addListener` also pings the module's `addListener` counter, and removal pings
// `removeListeners`, so native observes only while someone is listening.
export class NativeEventEmitter {
  private readonly module?: IEventEmitterModule;

  constructor(module?: IEventEmitterModule) {
    // Keep the module ONLY if it has both counter methods, exactly like RN: a
    // module missing them stays unset, so the `this.module?.` calls below no-op
    // instead of crashing on `undefined(...)`.
    if (module !== undefined && hasObserveCounters(module)) {
      this.module = module;
    } else if (module !== undefined) {
      dlog(
        'NativeEventEmitter: module lacks addListener/removeListeners; dropping it (counter pings become no-ops)',
      );
    }
  }

  addListener(
    eventType: string,
    listener: INativeEventListener,
  ): IEventSubscription {
    // The module counter tells native to START observing; without it (module
    // unresolved) native may never emit. Logged to pinpoint a silent native side.
    const via = injectedSource !== undefined ? 'host-bus' : 'fallback-hub';
    dlog(
      `NativeEventEmitter.addListener "${eventType}" ` +
        `module-counter=${this.module ? 'pinged' : 'none'} via=${via}`,
    );
    this.module?.addListener(eventType);

    if (injectedSource !== undefined) {
      // The host bus delivers raw (no framework flush); wrap so a listener's
      // setState lands on the sync lane and paints, like Fabric touch events.
      const subscription = injectedSource.addListener(eventType, payload => {
        runWrapped(() => listener(payload));
      });
      let removed = false;
      return {
        remove: () => {
          if (removed) return;
          removed = true;
          subscription.remove();
          this.module?.removeListeners(1);
        },
      };
    }

    // Fallback bus (headless / non-RN host): the internal hub. Its `emit` wraps.
    const raw: IDeviceListener = (...args) => listener(args[0]);
    addRawListener(eventType, raw);
    let removed = false;
    return {
      remove: () => {
        if (removed) return;
        removed = true;
        removeRawListener(eventType, raw);
        this.module?.removeListeners(1);
      },
    };
  }

  // RN's NativeEventEmitter.emit: a JS-side emit onto the same device bus native feeds.
  emit(eventType: string, ...args: unknown[]): void {
    if (injectedSource !== undefined) {
      injectedSource.emit?.(eventType, ...args);
      return;
    }
    emit(eventType, ...args);
  }

  // RN's NativeEventEmitter.removeAllListeners: EVERY listener of the event on the device bus goes,
  // not only this emitter's, and the module counter drops by that many.
  removeAllListeners(eventType: string): void {
    invariant(
      eventType != null,
      '`NativeEventEmitter.removeAllListener()` requires a non-null argument.',
    );
    if (injectedSource !== undefined) {
      this.module?.removeListeners(
        injectedSource.listenerCount?.(eventType) ?? 0,
      );
      injectedSource.removeAllListeners?.(eventType);
      return;
    }
    this.module?.removeListeners(listeners.get(eventType)?.size ?? 0);
    listeners.delete(eventType);
  }
}
