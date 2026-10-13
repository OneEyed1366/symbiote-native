import { installRecordingFabric } from '@symbiote-native/test-utils';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startMapper } from 'react-native-reanimated/src/core';
import { updateProps } from 'react-native-reanimated/src/updateProps';
import {
  reactiveBox,
  renderComposable,
} from '../../../test-support/render-svelte-composable.svelte';
import {
  recordUpdateWrites,
  type IUpdateWrite,
} from '../../../test-support/update-writes';
import { settle, workletOf } from '../../../test-support/worklet';
import { createSharedValue } from '../../core/shared-value';
import { hooks } from './hooks';

const { useAnimatedStyle, useDerivedValue, useAnimatedReaction } = hooks;

installRecordingFabric();

vi.mock('react-native-reanimated/src/updateProps', () => ({
  updateProps: vi.fn(),
}));

function withSpiedMapper<Module extends { startMapper: typeof startMapper }>(
  actual: Module,
): Module {
  return { ...actual, startMapper: vi.fn(actual.startMapper) };
}

vi.mock('react-native-reanimated/src/core', async importOriginal =>
  withSpiedMapper(
    await importOriginal<typeof import('react-native-reanimated/src/core')>(),
  ),
);

const VIEW = { tag: 7, shadowNodeWrapper: {} };
const writes: IUpdateWrite[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(startMapper).mockClear();
  recordUpdateWrites(updateProps, writes);
});

afterEach(() => vi.useRealTimers());

function closuresOfMappers(): unknown[] {
  return vi.mocked(startMapper).mock.calls.map(call => call[1]);
}

describe('useAnimatedStyle in Svelte', () => {
  function opacityOf(source: { value: number }) {
    return workletOf(() => ({ opacity: source.value }), [source], 21);
  }

  it('writes to an attached view when a shared value changes', async () => {
    const { shared } = createSharedValue(1);
    const rendered = renderComposable(() =>
      useAnimatedStyle(opacityOf(shared)),
    );
    const handle = rendered.result();
    handle.viewDescriptors.add(VIEW, handle.styleUpdaterContainer);
    await settle();
    writes.length = 0;

    shared.value = 0.25;
    await settle();

    expect(writes.map(write => write.updates)).toEqual([{ opacity: 0.25 }]);
  });

  it('starts the mapper again over what a rune holds after a change', () => {
    const box = reactiveBox({ scale: 1 });
    const updater = workletOf(
      () => ({ opacity: box.value.scale }),
      [box.value],
      22,
    );
    renderComposable(() => useAnimatedStyle(updater));

    box.value = { scale: 0.5 };
    flushSync();

    expect(vi.mocked(startMapper).mock.calls.length).toBe(2);
  });

  it('stops writing once the component is gone', async () => {
    const { shared } = createSharedValue(1);
    const rendered = renderComposable(() =>
      useAnimatedStyle(opacityOf(shared)),
    );
    const handle = rendered.result();
    handle.viewDescriptors.add(VIEW, handle.styleUpdaterContainer);
    await settle();

    rendered.unmount();
    await settle();
    writes.length = 0;
    shared.value = 0.3;
    await settle();

    expect(writes).toEqual([]);
  });
});

describe('useDerivedValue in Svelte', () => {
  it('follows the shared values the updater reads', async () => {
    const { shared } = createSharedValue(1);
    const rendered = renderComposable(() =>
      useDerivedValue(workletOf(() => shared.value * 2, [shared], 7)),
    );

    shared.value = 5;
    await settle();

    expect(rendered.result().value).toBe(10);
  });

  it('starts the mapper again over a copy of what a rune holds after a change', () => {
    const box = reactiveBox({ factor: 1 });
    const updater = workletOf(() => box.value.factor * 2, [box.value], 8);
    renderComposable(() => useDerivedValue(updater));

    box.value = { factor: 3 };
    flushSync();

    expect(closuresOfMappers()).toHaveLength(2);
  });
});

describe('useAnimatedReaction in Svelte', () => {
  it('reacts to what prepare returns, and to the value before it', async () => {
    const { shared } = createSharedValue(1);
    const react = vi.fn();
    renderComposable(() =>
      useAnimatedReaction(
        workletOf(() => shared.value, [shared], 11),
        workletOf(react, [], 12),
      ),
    );
    await settle();
    react.mockClear();

    shared.value = 2;
    await settle();

    expect(react).toHaveBeenCalledWith(2, 1);
  });

  it('stops reacting once the component is gone', async () => {
    const { shared } = createSharedValue(1);
    const react = vi.fn();
    const rendered = renderComposable(() =>
      useAnimatedReaction(
        workletOf(() => shared.value, [shared], 11),
        workletOf(react, [], 12),
      ),
    );
    await settle();

    rendered.unmount();
    await settle();
    react.mockClear();
    shared.value = 5;
    await settle();

    expect(react).not.toHaveBeenCalled();
  });
});
