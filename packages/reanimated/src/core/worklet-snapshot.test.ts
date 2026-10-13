import { describe, expect, it } from 'vitest';
import {
  isWorkletFunction,
  serializableMappingCache,
} from 'react-native-worklets';
import { workletOf } from '../../test-support/worklet';
import { createSharedValue } from './shared-value';
import { snapshotIfWorklet, snapshotWorklet } from './worklet-snapshot';

function closureOf(worklet: unknown): unknown[] {
  if (typeof worklet !== 'function') throw new Error('not a worklet');
  const closure: unknown = Reflect.get(worklet, '__closure');
  if (!Array.isArray(closure)) throw new Error('no closure');
  return closure;
}

function withClosure(closure: unknown[], hash = 7) {
  return workletOf(() => 'ran', closure, hash);
}

describe('the snapshot of a callback that may not be a worklet', () => {
  it('is a snapshot for a worklet', () => {
    const worklet = withClosure([{ scale: 1 }]);

    expect(snapshotIfWorklet(worklet)).not.toBe(worklet);
  });

  it('is the callback itself for any other function, which the runtime refuses on its own', () => {
    const callback = () => 1;

    expect(snapshotIfWorklet(callback)).toBe(callback);
  });
});

describe('the snapshot of a worklet', () => {
  it('is another function, so the clone the runtime keeps for the first stays unread', () => {
    const worklet = withClosure([]);

    expect(snapshotWorklet(worklet)).not.toBe(worklet);
  });

  it('runs the worklet it was taken from', () => {
    const worklet = workletOf((a: number, b: number) => a + b, [], 1);

    expect(snapshotWorklet(worklet)(2, 3)).toBe(5);
  });

  it('keeps the hash and the init data, which the runtime clones once for all snapshots', () => {
    const initData = { code: 'x' };
    const worklet = Object.assign(withClosure([], 42), {
      __initData: initData,
    });

    const snapshot = snapshotWorklet(worklet);

    expect(snapshot.__workletHash).toBe(42);
    expect(snapshot.__initData).toBe(initData);
  });

  it('copies an object of the closure, so the original is never handed to the runtime', () => {
    const props = { scale: 2 };

    const [copy] = closureOf(snapshotWorklet(withClosure([props])));

    expect(copy).toEqual({ scale: 2 });
    expect(copy).not.toBe(props);
  });

  it('reads the values as they are now, whatever hands them out', () => {
    let scale = 1;
    const props = {
      get scale() {
        return scale;
      },
    };
    const worklet = withClosure([props]);

    scale = 3;

    expect(closureOf(snapshotWorklet(worklet))).toEqual([{ scale: 3 }]);
  });

  it('is fresh every time it is taken, as a change has to reach a new clone', () => {
    const props = { scale: 1 };
    const worklet = withClosure([props]);
    const first = snapshotWorklet(worklet);

    props.scale = 4;
    const second = snapshotWorklet(worklet);

    expect(closureOf(first)).toEqual([{ scale: 1 }]);
    expect(closureOf(second)).toEqual([{ scale: 4 }]);
  });

  it('copies what is nested in an object or an array', () => {
    const props = { list: [{ id: 1 }], deep: { inner: { id: 2 } } };

    const [copy] = closureOf(snapshotWorklet(withClosure([props])));

    expect(copy).toEqual(props);
    expect(copy).not.toBe(props);
    expect(Reflect.get(Object(copy), 'deep')).not.toBe(props.deep);
  });

  it('leaves a shared value as it is, the runtime knows how to hold it', () => {
    const { shared } = createSharedValue(1);

    const [kept] = closureOf(snapshotWorklet(withClosure([shared])));

    expect(kept).toBe(shared);
  });

  it('leaves an object the runtime already holds as a serializable, a copy would lose its identity', () => {
    const held = { state: 1 };
    serializableMappingCache.set(held, {});

    const [kept] = closureOf(snapshotWorklet(withClosure([held])));

    expect(kept).toBe(held);
  });

  it('takes a snapshot of a worklet in the closure too, as it may hold a reactive object', () => {
    const props = { scale: 1 };
    const inner = withClosure([props]);

    const [copied] = closureOf(snapshotWorklet(withClosure([inner])));

    expect(copied).not.toBe(inner);
    expect(closureOf(copied)[0]).toEqual(props);
    expect(closureOf(copied)[0]).not.toBe(props);
  });

  it('leaves primitives and what is not plain data as they are', () => {
    const table = new Map([[1, 2]]);

    const [count, kept] = closureOf(snapshotWorklet(withClosure([3, table])));

    expect(count).toBe(3);
    expect(kept).toBe(table);
  });

  it('turns an accessor the framework names into a worklet that answers with its value now', () => {
    let held = 0.5;
    const accessor = () => held;
    const readAccessor = (candidate: unknown) =>
      candidate === accessor ? { value: held } : undefined;

    const [getter] = closureOf(
      snapshotWorklet(withClosure([accessor]), readAccessor),
    );
    held = 2;

    expect(getter).not.toBe(accessor);
    expect(isWorkletFunction(getter)).toBe(true);
    expect(Reflect.apply(Object(getter), undefined, [])).toBe(0.5);
  });

  it('copies what an accessor holds, which may be an object of the framework', () => {
    const object = { scale: 1 };
    const accessor = () => object;
    const readAccessor = (candidate: unknown) =>
      candidate === accessor ? { value: object } : undefined;

    const [getter] = closureOf(
      snapshotWorklet(withClosure([accessor]), readAccessor),
    );
    const answered = Reflect.apply(Object(getter), undefined, []);

    expect(answered).toEqual({ scale: 1 });
    expect(answered).not.toBe(object);
  });

  it('leaves any other function as it is when the framework names no accessor', () => {
    const plain = () => 1;

    const [kept] = closureOf(snapshotWorklet(withClosure([plain])));

    expect(kept).toBe(plain);
  });

  it('reaches the end of an object that holds itself', () => {
    const loop: Record<string, unknown> = { name: 'loop' };
    loop.self = loop;

    const [copy] = closureOf(snapshotWorklet(withClosure([loop])));

    expect(Reflect.get(Object(copy), 'self')).toBe(copy);
  });
});
