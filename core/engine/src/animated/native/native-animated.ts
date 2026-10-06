// The native-driver bridge. When an animation runs with
// useNativeDriver:true, the whole value graph is mirrored into native "animated
// nodes" and the curve is handed to the stock NativeAnimated TurboModule, which
// then mutates the bound shadow node every frame with ZERO JS per frame.
//
// We consume the module that ships in stock react-native, no native fork. On
// iOS bridgeless it registers as `NativeAnimatedTurboModule`; we fall back to the
// legacy `NativeAnimatedModule` name. Resolution goes through the same JSI seam as
// every other native module (getNativeModule). The
// module is resolved lazily on first use, so importing this file headless (no
// native host) is inert until a native-driven animation actually starts.

import { dlog } from '../../debug';
import { hostCall } from '../../host-call';
import { getNativeModule } from '../../native-modules';
import {
  NativeEventEmitter,
  type IEventSubscription,
} from '../../native-events';
import { isRecord } from '../../type-guards';

// Opaque per-platform tuning bag forwarded into a native node/animation config,
// mirroring RN's AnimatedPlatformConfig.js (`export type PlatformConfig = {}`).
// Stock RN keeps it empty today; it is the seam a future native driver reads
// platform-specific knobs from. Forwarded verbatim, never inspected here.
export type IPlatformConfig = Record<string, unknown>;

// An animated-node config (`{type:'value'|'interpolation'|'style'|'transform'|'props', ...}`)
// and an animation config (`{type:'frames'|'spring'|'decay', ...}`) cross into native as
// plain JSON. They are open by design: each node/driver fills its own shape.
export type INativeNodeConfig = {
  readonly type: string;
  readonly [key: string]: unknown;
};
export type INativeAnimationConfig = {
  readonly type: string;
  readonly [key: string]: unknown;
};
export type INativeEventMapping = {
  readonly nativeEventPath: readonly string[];
  readonly animatedValueTag: number;
};

export type INativeEndResult = {
  finished: boolean;
  value?: number;
  offset?: number;
};
export type INativeEndCallback = (result: INativeEndResult) => void;

// Методы TurboModule без батчинга Android, форму гарантирует дженерик `getNativeModule`
type INativeAnimatedSpec = {
  createAnimatedNode(tag: number, config: INativeNodeConfig): void;
  updateAnimatedNodeConfig?(tag: number, config: INativeNodeConfig): void;
  connectAnimatedNodes(parentTag: number, childTag: number): void;
  disconnectAnimatedNodes(parentTag: number, childTag: number): void;
  connectAnimatedNodeToView(nodeTag: number, viewTag: number): void;
  disconnectAnimatedNodeFromView(nodeTag: number, viewTag: number): void;
  restoreDefaultValues(nodeTag: number): void;
  dropAnimatedNode(tag: number): void;
  startAnimatingNode(
    animationId: number,
    nodeTag: number,
    config: INativeAnimationConfig,
    endCallback: INativeEndCallback,
  ): void;
  stopAnimation(animationId: number): void;
  setAnimatedNodeValue(nodeTag: number, value: number): void;
  setAnimatedNodeOffset(nodeTag: number, offset: number): void;
  flattenAnimatedNodeOffset(nodeTag: number): void;
  extractAnimatedNodeOffset(nodeTag: number): void;
  startListeningToAnimatedNodeValue(tag: number): void;
  stopListeningToAnimatedNodeValue(tag: number): void;
  getValue(tag: number, saveValueCallback: (value: number) => void): void;
  addAnimatedEventToView(
    viewTag: number,
    eventName: string,
    eventMapping: INativeEventMapping,
  ): void;
  removeAnimatedEventFromView(
    viewTag: number,
    eventName: string,
    animatedNodeTag: number,
  ): void;
  connectAnimatedNodeToShadowNodeFamily?(
    nodeTag: number,
    shadowNode: unknown,
  ): void;
  startOperationBatch?(): void;
  finishOperationBatch?(): void;
};

type IFeatureFlagsSpec = {
  cxxNativeAnimatedEnabled?(): boolean;
  useSharedAnimatedBackend?(): boolean;
};

// iOS bridgeless registers the Turbo variant; the legacy name is the fallback.
const TURBO_MODULE_NAME = 'NativeAnimatedTurboModule';
const LEGACY_MODULE_NAME = 'NativeAnimatedModule';

let resolved: INativeAnimatedSpec | null = null;

function module(): INativeAnimatedSpec | null {
  if (resolved !== null) return resolved;
  // Don't cache a miss: the native host may not be installed yet at first call
  // (or a headless smoke installs a fake afterwards).
  const found =
    getNativeModule<INativeAnimatedSpec>(TURBO_MODULE_NAME) ??
    getNativeModule<INativeAnimatedSpec>(LEGACY_MODULE_NAME);
  if (found !== null) resolved = found;
  return found;
}

// True when the stock native module is present in the binary: the gate the
// drivers consult before honouring useNativeDriver:true (else they fall back to
// the JS-driven path).
export function isNativeAnimatedAvailable(): boolean {
  return module() !== null;
}

let nextNodeTag = 1;
let nextAnimationId = 1;

export function generateNativeNodeTag(): number {
  return nextNodeTag++;
}
export function generateNativeAnimationId(): number {
  return nextAnimationId++;
}

// JS observation of a native-driven value. While native owns the frames, JS sees
// no per-frame change, so a JS listener on a native value asks native to stream
// updates back, which it emits as `onAnimatedValueUpdate` ({tag, value}) on the
// device event bus. One subscription fans those out to per-tag callbacks. The event
// NAME is the load-bearing contract with the stock native module (a wrong name is
// silent headless and dead on device).
const VALUE_UPDATE_EVENT = 'onAnimatedValueUpdate';
const valueListeners = new Map<number, (value: number) => void>();
let valueUpdateSubscription: IEventSubscription | undefined;

function ensureValueUpdateSubscription(): void {
  if (valueUpdateSubscription !== undefined) return;
  valueUpdateSubscription = new NativeEventEmitter().addListener(
    VALUE_UPDATE_EVENT,
    payload => {
      if (!isRecord(payload)) return;
      const tag = Reflect.get(payload, 'tag');
      const value = Reflect.get(payload, 'value');
      if (typeof tag === 'number' && typeof value === 'number') {
        valueListeners.get(tag)?.(value);
      }
    },
  );
}

// Очередь как в `NativeAnimatedHelper`: при `cxxNativeAnimatedEnabled` C++ модуль исполняет вызовы
// только между `startOperationBatch` и `finishOperationBatch`, поэтому все вызовы встают в очередь
const queue: (() => void)[] = [];
let flushHandle: unknown;
const flagValues = new Map<keyof IFeatureFlagsSpec, boolean>();

// Читаем один раз как RN, промах (хост ещё не поднят) не кешируем
function readFlag(name: keyof IFeatureFlagsSpec): boolean {
  const cached = flagValues.get(name);
  if (cached !== undefined) return cached;
  const flags = getNativeModule<IFeatureFlagsSpec>(
    'NativeReactNativeFeatureFlags',
  );
  if (flags === null) return false;
  const isOn = flags[name]?.() === true;
  flagValues.set(name, isOn);
  return isOn;
}

function shouldSignalBatch(): boolean {
  return readFlag('cxxNativeAnimatedEnabled');
}

// Общий backend находит вью по семейству shadow node, поэтому узел цепляется и к нему
export function usesSharedBackend(): boolean {
  return (
    readFlag('cxxNativeAnimatedEnabled') && readFlag('useSharedAnimatedBackend')
  );
}

function flushQueue(): void {
  flushHandle = undefined;
  if (queue.length === 0) return;
  const native = module();
  native?.startOperationBatch?.();
  for (const operation of queue.splice(0)) operation();
  native?.finishOperationBatch?.();
}

// Без модуля вызов тихо пропускается, а не бросает внутри коммита
function send(operation: (native: INativeAnimatedSpec) => void): void {
  const native = module();
  if (native === null) return;
  if (queue.length === 0 && !shouldSignalBatch()) {
    operation(native);
    return;
  }
  queue.push(() => operation(native));
  hostCall('clearImmediate', [flushHandle]);
  flushHandle = hostCall('setImmediate', [flushQueue]);
}

export const nativeAnimated = {
  createAnimatedNode(tag: number, config: INativeNodeConfig): void {
    send(native => native.createAnimatedNode(tag, config));
  },
  updateAnimatedNodeConfig(tag: number, config: INativeNodeConfig): void {
    send(native => native.updateAnimatedNodeConfig?.(tag, config));
  },
  connectAnimatedNodes(parentTag: number, childTag: number): void {
    send(native => native.connectAnimatedNodes(parentTag, childTag));
  },
  disconnectAnimatedNodes(parentTag: number, childTag: number): void {
    send(native => native.disconnectAnimatedNodes(parentTag, childTag));
  },
  connectAnimatedNodeToView(nodeTag: number, viewTag: number): void {
    dlog(`native: connect node=${nodeTag} -> view=${viewTag}`);
    send(native => native.connectAnimatedNodeToView(nodeTag, viewTag));
  },
  connectAnimatedNodeToShadowNodeFamily(
    nodeTag: number,
    shadowNode: unknown,
  ): void {
    send(native =>
      native.connectAnimatedNodeToShadowNodeFamily?.(nodeTag, shadowNode),
    );
  },
  disconnectAnimatedNodeFromView(nodeTag: number, viewTag: number): void {
    send(native => native.disconnectAnimatedNodeFromView(nodeTag, viewTag));
  },
  restoreDefaultValues(nodeTag: number): void {
    dlog(`native: restoreDefaultValues node=${nodeTag}`);
    send(native => native.restoreDefaultValues(nodeTag));
  },
  dropAnimatedNode(tag: number): void {
    send(native => native.dropAnimatedNode(tag));
  },
  startAnimatingNode(
    animationId: number,
    nodeTag: number,
    config: INativeAnimationConfig,
    endCallback: INativeEndCallback,
  ): void {
    dlog(
      `native: startAnimatingNode id=${animationId} node=${nodeTag} type=${config.type}`,
    );
    send(native =>
      native.startAnimatingNode(animationId, nodeTag, config, endCallback),
    );
  },
  stopAnimation(animationId: number): void {
    send(native => native.stopAnimation(animationId));
  },
  setAnimatedNodeValue(nodeTag: number, value: number): void {
    dlog(`native: setAnimatedNodeValue node=${nodeTag} value=${value}`);
    send(native => native.setAnimatedNodeValue(nodeTag, value));
  },
  setAnimatedNodeOffset(nodeTag: number, offset: number): void {
    send(native => native.setAnimatedNodeOffset(nodeTag, offset));
  },
  flattenAnimatedNodeOffset(nodeTag: number): void {
    send(native => native.flattenAnimatedNodeOffset(nodeTag));
  },
  extractAnimatedNodeOffset(nodeTag: number): void {
    send(native => native.extractAnimatedNodeOffset(nodeTag));
  },
  startListeningToAnimatedNodeValue(tag: number): void {
    send(native => native.startListeningToAnimatedNodeValue(tag));
  },
  stopListeningToAnimatedNodeValue(tag: number): void {
    send(native => native.stopListeningToAnimatedNodeValue(tag));
  },
  getValue(tag: number, callback: (value: number) => void): void {
    send(native => native.getValue(tag, callback));
  },
  // High-level value observation: register a per-tag callback and ask native to
  // stream this node's updates. The last unsubscribe tears the shared device
  // subscription down too.
  startListeningToValue(tag: number, callback: (value: number) => void): void {
    ensureValueUpdateSubscription();
    valueListeners.set(tag, callback);
    dlog(`native: startListeningToValue node=${tag}`);
    send(native => native.startListeningToAnimatedNodeValue(tag));
  },
  stopListeningToValue(tag: number): void {
    valueListeners.delete(tag);
    send(native => native.stopListeningToAnimatedNodeValue(tag));
    if (valueListeners.size === 0 && valueUpdateSubscription !== undefined) {
      valueUpdateSubscription.remove();
      valueUpdateSubscription = undefined;
    }
  },
  addAnimatedEventToView(
    viewTag: number,
    eventName: string,
    mapping: INativeEventMapping,
  ): void {
    send(native => native.addAnimatedEventToView(viewTag, eventName, mapping));
  },
  removeAnimatedEventFromView(
    viewTag: number,
    eventName: string,
    animatedNodeTag: number,
  ): void {
    send(native =>
      native.removeAnimatedEventFromView(viewTag, eventName, animatedNodeTag),
    );
  },
};
