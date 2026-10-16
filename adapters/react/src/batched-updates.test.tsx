// RN's `unstable_batchedUpdates`: the callback runs now, its state updates land as one commit
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  unstable_batchedUpdates,
} from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 90_430;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let renders = 0;
let bump: (() => void) | undefined;

function Counter(): null {
  const [first, setFirst] = useState(0);
  const [second, setSecond] = useState(0);
  renders++;
  bump = () => {
    setFirst(first + 1);
    setSecond(second + 1);
  };
  return null;
}

beforeEach(() => {
  fabric.reset();
  renders = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('unstable_batchedUpdates', () => {
  it('runs the callback at once and returns its result', () => {
    expect(unstable_batchedUpdates(() => 5)).toBe(5);
  });

  it('hands the argument to the callback', () => {
    expect(unstable_batchedUpdates((value: number) => value + 1, 2)).toBe(3);
  });

  it('commits two state updates once', async () => {
    mount(ROOT_TAG, <Counter />);
    await tick();
    const rendersBefore = renders;
    unstable_batchedUpdates(() => bump?.());
    await tick();

    expect(renders - rendersBefore).toBe(1);
  });
});
