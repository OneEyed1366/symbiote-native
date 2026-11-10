import { installRecordingFabric } from '@symbiote-native/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { renderComposable } from '../../../test-support/render-composable';
import { workletOf } from '../../../test-support/worklet';
import { useAnimatedScrollHandler } from './use-animated-scroll-handler';

installRecordingFabric();

function scrollEvent(eventName: string) {
  return { eventName, contentOffset: { x: 0, y: 12 } };
}

describe('useAnimatedScrollHandler', () => {
  it('takes a single function as the scroll handler', () => {
    const onScroll = vi.fn();
    const composable = renderComposable(() =>
      useAnimatedScrollHandler(workletOf(onScroll, [], 41)),
    );

    const { workletEventHandler } = composable.result();
    workletEventHandler.worklet(scrollEvent('onScroll'));

    expect(workletEventHandler.eventNames).toEqual(['onScroll']);
    expect(onScroll).toHaveBeenCalledTimes(1);
  });

  it('subscribes to the events of the handlers it was given', () => {
    const composable = renderComposable(() =>
      useAnimatedScrollHandler({
        onScroll: workletOf(vi.fn(), [], 42),
        onMomentumEnd: workletOf(vi.fn(), [], 43),
      }),
    );

    expect(composable.result().workletEventHandler.eventNames).toEqual([
      'onScroll',
      'onMomentumScrollEnd',
    ]);
  });

  it('hands the handlers one context that outlives the events', () => {
    const contexts: unknown[] = [];
    const record = workletOf(
      (_event: unknown, context: unknown) => {
        contexts.push(context);
      },
      [],
      44,
    );
    const composable = renderComposable(() =>
      useAnimatedScrollHandler({ onScroll: record }),
    );

    const { workletEventHandler } = composable.result();
    workletEventHandler.worklet(scrollEvent('onScroll'));
    workletEventHandler.worklet(scrollEvent('onScroll'));

    expect(contexts[0]).toBe(contexts[1]);
  });
});
