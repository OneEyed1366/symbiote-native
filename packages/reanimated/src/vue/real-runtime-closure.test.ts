import { reactive } from '@vue/runtime-core';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createSerializable } from 'react-native-worklets/src/memory/serializable.native';
import { workletOf } from '../../test-support/worklet';
import { snapshotWorklet } from '../core/worklet-snapshot';

// The serializing code of `react-native-worklets` as it ships, over a native module that only
// says what it was asked to make. It is how a dev build treats a closure, short of the device

type IMade = { made: string; args: unknown[] };

vi.mock(
  'react-native-worklets/src/WorkletsModule/NativeWorklets.native',
  () => ({
    WorkletsModule: new Proxy(
      {},
      {
        get:
          (_target, made: string) =>
          (...args: unknown[]): IMade => ({ made, args }),
      },
    ),
  }),
);

// Every number the serializing handed to the native side, wherever it sits in the clone
function numbersIn(clone: unknown): number[] {
  if (typeof clone !== 'object' || clone === null) return [];
  if (!('made' in clone && 'args' in clone && Array.isArray(clone.args))) {
    return Object.values(clone).flatMap(numbersIn);
  }
  const [first] = clone.args;
  return clone.made === 'createSerializableNumber' ? [first] : numbersIn(first);
}

function scaleWorklet(props: { scale: number }) {
  return workletOf(() => props.scale, [props], 21);
}

beforeAll(() => {
  Reflect.set(globalThis, '__RUNTIME_KIND', 1);
});

describe('a Vue object in the closure of a worklet, in a dev build', () => {
  it('stops taking writes once the runtime has been handed the worklet as it is', () => {
    const props = reactive({ scale: 1 });

    createSerializable(scaleWorklet(props));
    props.scale = 2;

    expect(props.scale).toBe(1);
  });

  it('keeps taking writes when the runtime was handed a snapshot', () => {
    const props = reactive({ scale: 1 });

    createSerializable(snapshotWorklet(scaleWorklet(props)));
    props.scale = 2;

    expect(props.scale).toBe(2);
  });

  it('gives the same clone for the same worklet, so a change never reaches it', () => {
    const props = reactive({ scale: 1 });
    const worklet = scaleWorklet(props);
    const first = createSerializable(worklet);

    expect(createSerializable(worklet)).toBe(first);
  });

  it('gives a clone that holds the value of the change when the snapshot is taken again', () => {
    const props = reactive({ scale: 1 });
    const worklet = scaleWorklet(props);
    const before = createSerializable(snapshotWorklet(worklet));

    props.scale = 2;
    const after = createSerializable(snapshotWorklet(worklet));

    expect(numbersIn(before)).toContain(1);
    expect(numbersIn(after)).toContain(2);
    expect(numbersIn(after)).not.toContain(1);
  });
});
