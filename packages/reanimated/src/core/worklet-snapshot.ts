import type { WorkletFunction } from 'react-native-worklets';
import {
  isWorkletFunction,
  serializableMappingCache,
} from 'react-native-worklets';
import { isSharedValue } from 'react-native-reanimated/src/isSharedValue';
import { valueGetter } from './value-getter';

// The runtime keeps the clone of a function or an object by identity, and in a dev build it turns
// every key of what it cloned into a getter that ignores writes. So a reactive object a worklet
// closes over is handed over as a copy of what it holds now, and a change makes a new copy

// What a framework answers for a function of its own that holds a value, such as a signal, and
// undefined for any other function. Such a function cannot reach the UI runtime, its value can
export type IReadAccessor = (
  candidate: unknown,
) => { value: unknown } | undefined;

type IContext = { memo: Map<object, unknown>; readAccessor?: IReadAccessor };

const CLOSURE = '__closure';

// A shared value, or whatever `makeShareable` and the like made: a copy would be another object
function isHeldByRuntime(value: object): boolean {
  return (
    isSharedValue(value) || serializableMappingCache.get(value) !== undefined
  );
}

function isPlainData(value: object): boolean {
  if (Array.isArray(value)) return true;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function copyEntries(value: object, copy: object, context: IContext): void {
  for (const key of Object.keys(value)) {
    Reflect.set(copy, key, copyValue(Reflect.get(value, key), context));
  }
}

function copyData(value: object, context: IContext): unknown {
  const copy = Array.isArray(value) ? [] : {};
  context.memo.set(value, copy);
  copyEntries(value, copy, context);
  return copy;
}

function copyFunction(value: unknown, context: IContext): unknown {
  if (isWorkletFunction(value)) return snapshotWith(value, context);
  const reading = context.readAccessor?.(value);
  return reading === undefined
    ? value
    : valueGetter(copyValue(reading.value, context));
}

function copyValue(value: unknown, context: IContext): unknown {
  if (typeof value === 'function') return copyFunction(value, context);
  if (typeof value !== 'object' || value === null) return value;
  if (context.memo.has(value)) return context.memo.get(value);
  if (isHeldByRuntime(value) || !isPlainData(value)) return value;
  return copyData(value, context);
}

function snapshotWith<Args extends unknown[], Result>(
  worklet: WorkletFunction<Args, Result>,
  context: IContext,
): WorkletFunction<Args, Result> {
  const known = context.memo.get(worklet);
  if (isWorkletFunction<Args, Result>(known)) return known;
  const snapshot = Object.assign((...args: Args): Result => worklet(...args), {
    __workletHash: worklet.__workletHash,
  });
  context.memo.set(worklet, snapshot);
  // Whatever else the plugin left stays as it is, the init data is cloned once for all snapshots
  for (const key of Object.keys(worklet)) {
    const entry = Reflect.get(worklet, key);
    Reflect.set(
      snapshot,
      key,
      key === CLOSURE ? copyValue(entry, context) : entry,
    );
  }
  return snapshot;
}

export function snapshotIfWorklet<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
  readAccessor?: IReadAccessor,
): (...args: Args) => Result {
  return isWorkletFunction<Args, Result>(callback)
    ? snapshotWorklet(callback, readAccessor)
    : callback;
}

export function snapshotWorklet<Args extends unknown[], Result>(
  worklet: WorkletFunction<Args, Result>,
  readAccessor?: IReadAccessor,
): WorkletFunction<Args, Result> {
  return snapshotWith(worklet, { memo: new Map(), readAccessor });
}
