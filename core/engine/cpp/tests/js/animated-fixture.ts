// Строительные блоки портов `Animated-itest`: поиск вью по `testID`, чтение прямых изменений

import { isRecord, type IEventSubscription } from '@symbiote-native/engine';

import { setReactNativeHost } from '../../../src/react-native-host';
import { stubHost } from './rn-host-stub';
import {
  expect,
  findByTestId,
  getDirectManipulationProps,
  mounted,
  useNativeAnimatedModule,
  type IMountedView,
} from './harness';

type IDeviceListener = (payload: unknown) => void;

// The device bus the C++ module emits `onAnimatedValueUpdate` on, as RN's `RCTDeviceEventEmitter`
function createDeviceBus(): {
  emit(type: string, payload: unknown): void;
  addListener(type: string, listener: IDeviceListener): IEventSubscription;
} {
  const listeners = new Map<string, Set<IDeviceListener>>();
  return {
    emit(type, payload) {
      const set = listeners.get(type);
      if (set === undefined) return;
      for (const listener of Array.from(set)) listener(payload);
    },
    addListener(type, listener) {
      const set = listeners.get(type) ?? new Set<IDeviceListener>();
      set.add(listener);
      listeners.set(type, set);
      return { remove: () => set.delete(listener) && undefined };
    },
  };
}

const nativeCalls: string[] = [];

// How many times the engine called `method` on the native animated module since the last reset
export function nativeCallCount(method: string): number {
  return nativeCalls.filter(name => name === method).length;
}

export function resetNativeCalls(): void {
  nativeCalls.length = 0;
}

// The module as the engine sees it, every method call written down on the way through
function recordCalls(module: object): object {
  return new Proxy(module, {
    get(target, key) {
      const member: unknown = Reflect.get(target, key);
      if (typeof member !== 'function') return member;
      return (...args: unknown[]): unknown => {
        nativeCalls.push(String(key));
        return Reflect.apply(member, target, args);
      };
    },
  });
}

// RN's C++ animated module plus the device bus it talks back on
export function useNativeAnimated(): void {
  useNativeAnimatedModule();
  const lookup: unknown = Reflect.get(globalThis, '__turboModuleProxy');
  if (typeof lookup !== 'function') throw new Error('no turbo module registry');
  Reflect.set(globalThis, '__turboModuleProxy', (name: string): unknown => {
    const found: unknown = lookup(name);
    return typeof found === 'object' && found !== null
      ? recordCalls(found)
      : found;
  });
  const bus = createDeviceBus();
  // RN defines this global read-only, a plain `Reflect.set` would silently keep RN's own emitter
  Object.defineProperty(globalThis, '__rctDeviceEventEmitter', {
    configurable: true,
    value: bus,
  });
  setReactNativeHost({
    ...stubHost,
    DeviceEventEmitter: bus,
    NativeEventEmitter: class {
      addListener = bus.addListener;
    },
  });
}

// Jest's `toBeCloseTo(expected, 0.001)`: the difference stays under half a unit
export function expectCloseTo(actual: unknown, expected: number): void {
  expect(typeof actual === 'number' && Math.abs(actual - expected) < 0.5).toBe(
    true,
  );
}

export function viewByTestId(testID: string): IMountedView {
  const found = findByTestId(testID);
  if (found === undefined) throw new Error(`no view with testID ${testID}`);
  return found;
}

function renderedNode(node: IMountedView, keys: readonly string[]): string {
  const attributes = [...keys]
    .sort()
    .filter(key => node.props[key] !== undefined)
    .map(key => ` ${key}="${node.props[key]}"`)
    .join('');
  if (node.children.length === 0) return `<rn-view${attributes} />`;
  const inner = node.children.map(child => renderedNode(child, keys)).join('');
  return `<rn-view${attributes}>${inner}</rn-view>`;
}

// Fantom's `getRenderedOutput({ props })` as a JSX string, the mounted views under the root
export function renderedOutput(keys: readonly string[]): string {
  return mounted()
    .children.map(child => renderedNode(child, keys))
    .join('');
}

// One key of the first `transform` entry the animation wrote straight into the view
export function directTransformValue(tag: number, key: string): unknown {
  const transform = getDirectManipulationProps(tag).transform;
  if (!Array.isArray(transform)) return undefined;
  const entry: unknown = transform[0];
  return isRecord(entry) ? entry[key] : undefined;
}
