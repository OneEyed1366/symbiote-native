import { installRecordingFabric } from '@symbiote-native/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '../../../test-support/render-hook';
import { workletOf } from '../../../test-support/worklet';
import { useAnimatedScrollHandler } from './use-animated-scroll-handler';

installRecordingFabric();

function scrollEvent(eventName: string) {
  return { eventName, contentOffset: { x: 0, y: 12 } };
}

describe('useAnimatedScrollHandler', () => {
  it('takes a single function as the scroll handler', () => {
    const onScroll = vi.fn();
    const hook = renderHook(
      () => useAnimatedScrollHandler(workletOf(onScroll, [], 41)),
      undefined,
    );

    const { workletEventHandler } = hook.latest();
    workletEventHandler.worklet(scrollEvent('onScroll'));

    expect(workletEventHandler.eventNames).toEqual(['onScroll']);
    expect(onScroll).toHaveBeenCalledTimes(1);
  });

  it('subscribes to the events of the handlers it was given', () => {
    const hook = renderHook(
      () =>
        useAnimatedScrollHandler({
          onScroll: workletOf(vi.fn(), [], 42),
          onMomentumEnd: workletOf(vi.fn(), [], 43),
        }),
      undefined,
    );

    expect(hook.latest().workletEventHandler.eventNames).toEqual([
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
    const hook = renderHook(
      () => useAnimatedScrollHandler({ onScroll: record }),
      undefined,
    );

    const { workletEventHandler } = hook.latest();
    workletEventHandler.worklet(scrollEvent('onScroll'));
    workletEventHandler.worklet(scrollEvent('onScroll'));

    expect(contexts).toHaveLength(2);
    expect(contexts[0]).toBe(contexts[1]);
  });

  it('runs the new worklet, on the same handler, once a worklet changes', () => {
    const stale = vi.fn();
    const fresh = vi.fn();
    const hook = renderHook(
      (run: () => void) =>
        useAnimatedScrollHandler({ onScroll: workletOf(run, [run], 46) }),
      stale,
    );
    const first = hook.latest().workletEventHandler;

    hook.rerender(fresh);
    first.worklet(scrollEvent('onScroll'));

    expect(hook.latest().workletEventHandler).toBe(first);
    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it('is the same handler on every render while the worklets stay the same', () => {
    const onScroll = workletOf(vi.fn(), [], 45);
    const hook = renderHook(
      () => useAnimatedScrollHandler({ onScroll }),
      undefined,
    );
    const first = hook.latest().workletEventHandler;

    hook.rerender(undefined);

    expect(hook.latest().workletEventHandler).toBe(first);
  });
});
