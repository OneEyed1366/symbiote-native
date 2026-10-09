import { installRecordingFabric } from '@symbiote-native/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateProps } from 'react-native-reanimated/src/updateProps';
import { renderHook } from '../../../test-support/render-hook';
import {
  recordUpdateWrites,
  type IUpdateWrite,
} from '../../../test-support/update-writes';
import { settle, workletOf } from '../../../test-support/worklet';
import { createSharedValue } from '../../core/shared-value';
import { useAnimatedProps } from './use-animated-props';

installRecordingFabric();

vi.mock('react-native-reanimated/src/updateProps', () => ({
  updateProps: vi.fn(),
}));

const VIEW = { tag: 9, shadowNodeWrapper: {} };
const writes: IUpdateWrite[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  recordUpdateWrites(updateProps, writes);
});

afterEach(() => vi.useRealTimers());

function labelOf(source: { value: string }) {
  return workletOf(() => ({ accessibilityLabel: source.value }), [source], 31);
}

describe('useAnimatedProps', () => {
  it('starts out as what the updater returns', () => {
    const { shared } = createSharedValue('start');

    const hook = renderHook(() => useAnimatedProps(labelOf(shared)), undefined);

    expect(hook.latest().initial.value).toEqual({
      accessibilityLabel: 'start',
    });
  });

  it('writes to an attached view as props, not as style', async () => {
    const { shared } = createSharedValue('start');
    const hook = renderHook(() => useAnimatedProps(labelOf(shared)), undefined);
    const handle = hook.latest();
    handle.viewDescriptors.add(VIEW, handle.styleUpdaterContainer);
    await settle();
    writes.length = 0;

    shared.value = 'next';
    await settle();

    expect(writes).toEqual([
      {
        views: [VIEW],
        updates: { accessibilityLabel: 'next' },
        isAnimatedProps: true,
      },
    ]);
  });

  it('runs the adapters over the values before they are written', async () => {
    const { shared } = createSharedValue('start');
    const adapter = workletOf(
      (props: Record<string, unknown>) => {
        props.testID = props.accessibilityLabel;
      },
      [],
      32,
    );
    const hook = renderHook(
      () => useAnimatedProps(labelOf(shared), null, adapter),
      undefined,
    );
    const handle = hook.latest();
    handle.viewDescriptors.add(VIEW, handle.styleUpdaterContainer);
    await settle();
    writes.length = 0;

    shared.value = 'next';
    await settle();

    expect(writes.map(write => write.updates)).toEqual([
      { accessibilityLabel: 'next', testID: 'next' },
    ]);
  });

  it('runs the adapter of the latest render, as upstream re-hashes them every render', async () => {
    const { shared } = createSharedValue('start');
    const copyTo = (key: string, hash: number) =>
      workletOf(
        (props: Record<string, unknown>) => {
          props[key] = props.accessibilityLabel;
        },
        [key],
        hash,
      );
    const hook = renderHook(
      (adapter: ReturnType<typeof copyTo>) =>
        useAnimatedProps(labelOf(shared), null, adapter),
      copyTo('testID', 33),
    );
    const handle = hook.latest();
    handle.viewDescriptors.add(VIEW, handle.styleUpdaterContainer);
    await settle();

    hook.rerender(copyTo('nativeID', 34));
    await settle();
    writes.length = 0;
    shared.value = 'next';
    await settle();

    expect(writes.map(write => write.updates)).toEqual([
      { accessibilityLabel: 'next', nativeID: 'next' },
    ]);
  });

  it('refuses an updater that is not a worklet', () => {
    expect(() =>
      renderHook(() => useAnimatedProps(() => ({})), undefined),
    ).toThrow(/useAnimatedProps needs a worklet/);
  });
});
