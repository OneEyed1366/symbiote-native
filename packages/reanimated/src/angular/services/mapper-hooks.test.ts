import { signal } from '@angular/core';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startMapper } from 'react-native-reanimated/src/core';
import { updateProps } from 'react-native-reanimated/src/updateProps';
import { renderComposable } from '../../../test-support/render-angular-composable';
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
let unmountTree = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(startMapper).mockClear();
  recordUpdateWrites(updateProps, writes);
});

afterEach(() => {
  unmountTree();
  vi.useRealTimers();
});

async function render<Result>(composable: () => Result) {
  const rendered = await renderComposable(composable);
  unmountTree = rendered.unmount;
  return rendered;
}

// The closure of the nth mapper that started, and what its first entry answers when called
function answerOfClosureEntry(nth: number): unknown {
  const closure = vi.mocked(startMapper).mock.calls[nth]?.[1];
  const entry: unknown = Array.isArray(closure) ? closure.at(0) : undefined;
  return typeof entry === 'function' ? entry() : undefined;
}

describe('useAnimatedStyle in Angular', () => {
  function opacityOf(source: { value: number }) {
    return workletOf(() => ({ opacity: source.value }), [source], 21);
  }

  it('writes to an attached view when a shared value changes', async () => {
    const { shared } = createSharedValue(1);
    const rendered = await render(() => useAnimatedStyle(opacityOf(shared)));
    const handle = rendered.result();
    handle.viewDescriptors.add(VIEW, handle.styleUpdaterContainer);
    await settle();
    writes.length = 0;

    shared.value = 0.25;
    await settle();

    expect(writes.map(write => write.updates)).toEqual([{ opacity: 0.25 }]);
  });

  it('hands the mapper the value a signal holds, as the function cannot cross', async () => {
    const scale = signal(1);
    const updater = workletOf(() => ({ opacity: scale() }), [scale], 22);

    await render(() => useAnimatedStyle(updater));

    expect(answerOfClosureEntry(0)).toBe(1);
  });

  it('starts the mapper again over the value a signal holds after a change', async () => {
    const scale = signal(1);
    const updater = workletOf(() => ({ opacity: scale() }), [scale], 23);
    await render(() => useAnimatedStyle(updater));

    scale.set(0.5);
    await settle();

    expect(vi.mocked(startMapper).mock.calls.length).toBe(2);
    expect(answerOfClosureEntry(1)).toBe(0.5);
  });

  it('stops writing once the component is gone', async () => {
    const { shared } = createSharedValue(1);
    const rendered = await render(() => useAnimatedStyle(opacityOf(shared)));
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

describe('useDerivedValue in Angular', () => {
  it('follows the shared values the updater reads', async () => {
    const { shared } = createSharedValue(1);
    const rendered = await render(() =>
      useDerivedValue(workletOf(() => shared.value * 2, [shared], 7)),
    );

    shared.value = 5;
    await settle();

    expect(rendered.result().value).toBe(10);
  });

  it('starts the mapper again over the value a signal holds after a change', async () => {
    const factor = signal(1);
    const updater = workletOf(() => factor() * 2, [factor], 8);
    await render(() => useDerivedValue(updater));

    factor.set(3);
    await settle();

    expect(vi.mocked(startMapper).mock.calls.length).toBe(2);
    expect(answerOfClosureEntry(1)).toBe(3);
  });
});

describe('useAnimatedReaction in Angular', () => {
  it('reacts to what prepare returns, and to the value before it', async () => {
    const { shared } = createSharedValue(1);
    const react = vi.fn();
    await render(() =>
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
    const rendered = await render(() =>
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
