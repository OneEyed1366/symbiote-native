// JS -> native: reaching a native (Turbo)Module through the JSI globals, like RN's own registry
// TODO(rn-port): stays ours, RN's `TurboModuleRegistry` captures `__turboModuleProxy` at import
// A fake installed later, or a headless engine without RN, would never be seen by it

import { dlog } from '../debug';
import { NativeEventEmitter, type IEventEmitterModule } from '../native-events';
import { invariant } from '../invariant';
import { isRecord } from '../type-guards';

// The JSI globals, typed at the trust boundary, the caller vouches for the module's shape via `T`
// Both are absent on the legacy (Paper) architecture
declare global {
  // Non-bridgeless New Architecture: a function proxy you call by module name
  var __turboModuleProxy: (<T>(name: string) => T | null) | undefined;
  // Bridgeless: a HostObject keyed by module name, installed instead of the function above
  var nativeModuleProxy: Record<string, unknown> | undefined;
}

// Native modules are always non-null objects, this is the single narrowing at the boundary
function isNativeModule<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

// The native module `name` typed as the caller's `T`, or null when the binary has no such module
// Null also covers a headless run without a fake installed
export function getNativeModule<T>(name: string): T | null {
  const turboProxy = globalThis.__turboModuleProxy;
  if (typeof turboProxy === 'function') {
    const module = turboProxy<T>(name);
    if (module !== null && module !== undefined) return module;
  }
  // A HostObject may throw for an unlinked name, and a throw here would blank the tree
  const bridgelessProxy = globalThis.nativeModuleProxy;
  if (bridgelessProxy !== undefined) {
    try {
      const module = bridgelessProxy[name];
      if (isNativeModule<T>(module)) return module;
    } catch (error) {
      dlog(`nativeModuleProxy["${name}"] threw: ${String(error)}`);
    }
  }
  dlog(
    `native module "${name}" not found ` +
      `(turbo=${typeof turboProxy}, bridgeless=${typeof globalThis.nativeModuleProxy})`,
  );
  return null;
}

// Throws when the module is missing, for a feature that cannot work without it (StatusBar)
export function getEnforcingNativeModule<T>(name: string): T {
  const module = getNativeModule<T>(name);
  invariant(
    module !== null,
    `TurboModuleRegistry.getEnforcing(...): '${name}' could not be found. ` +
      'Verify that a module by this name is registered in the native binary.',
  );
  return module;
}

// RN's `TurboModuleRegistry`, for a native module named in `react-native` code
export const TurboModuleRegistry = {
  get: getNativeModule,
  getEnforcing: getEnforcingNativeModule,
};

// Device-event module factory: a lazy native module plus a lazy emitter bound to it
// Each caller keeps its own degrade policy through the config

// A structural check, not a cast: the module qualifies only with both observe-counter methods
// `TModule` is unconstrained, `NativeEventEmitter` re-checks the same shape itself
function hasEventEmitterShape(value: unknown): value is IEventEmitterModule {
  return (
    isRecord(value) &&
    typeof value.addListener === 'function' &&
    typeof value.removeListeners === 'function'
  );
}

export type IDeviceEventModuleConfig<TModule> = {
  moduleName: string;
  // The `dlog` prefix of the module-resolution line, so each module keeps its own text
  moduleLogPrefix: string;
  // Whether the module is wired into the emitter, `false` for a module without observe-counters
  bindModuleToEmitter?: boolean;
  // Runs once right after the emitter is built, for a permanent self-subscription or hydration
  // Hydration from constants needs `addListener` before the read, so no update is missed
  onEmitterCreated?: (
    emitter: NativeEventEmitter,
    module: TModule | null,
  ) => void;
};

export type IDeviceEventModule<TModule> = {
  getModule(): TModule | null;
  getEmitter(): NativeEventEmitter;
};

// Each call owns its own cache, so two callers stay independent
export function createDeviceEventModule<TModule>(
  config: IDeviceEventModuleConfig<TModule>,
): IDeviceEventModule<TModule> {
  let module: TModule | null | undefined;
  let emitter: NativeEventEmitter | undefined;

  function getModule(): TModule | null {
    if (module === undefined) {
      module = getNativeModule<TModule>(config.moduleName);
      dlog(
        `${config.moduleLogPrefix} ${module ? 'resolved' : 'NOT resolved (null)'}`,
      );
    }
    return module;
  }

  function getEmitter(): NativeEventEmitter {
    if (emitter === undefined) {
      const resolved = getModule();
      const bindModule = config.bindModuleToEmitter ?? true;
      const boundModule =
        bindModule && resolved !== null && hasEventEmitterShape(resolved)
          ? resolved
          : undefined;
      emitter = new NativeEventEmitter(boundModule);
      config.onEmitterCreated?.(emitter, resolved);
    }
    return emitter;
  }

  return { getModule, getEmitter };
}
