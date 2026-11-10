import { installRecordingFabric } from '@symbiote-native/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '../../../test-support/render-hook';
import { workletOf } from '../../../test-support/worklet';
import { createEventHandler } from '../../core/event-handlers';
import { useComposedEventHandler } from './use-composed-event-handler';

installRecordingFabric();

type IEvent = { eventName: string };

function handlerFor(eventName: string, run: (event: IEvent) => void) {
  return createEventHandler<IEvent>(workletOf(run, [], 3), [eventName]);
}

describe('useComposedEventHandler', () => {
  it('runs every handler of the event that arrives', () => {
    const first = vi.fn();
    const second = vi.fn();
    const hook = renderHook(
      () =>
        useComposedEventHandler([
          handlerFor('onScroll', first),
          handlerFor('onScroll', second),
        ]),
      undefined,
    );

    hook.latest().workletEventHandler.worklet({ eventName: 'onScroll' });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('subscribes to the events of all of them', () => {
    const hook = renderHook(
      () =>
        useComposedEventHandler([
          handlerFor('onScroll', vi.fn()),
          handlerFor('onScrollEndDrag', vi.fn()),
          null,
        ]),
      undefined,
    );

    expect(hook.latest().workletEventHandler.eventNames).toEqual([
      'onScroll',
      'onScrollEndDrag',
    ]);
  });

  it('is the same handler on every render', () => {
    const hook = renderHook(
      () => useComposedEventHandler([handlerFor('onScroll', vi.fn())]),
      undefined,
    );
    const first = hook.latest().workletEventHandler;

    hook.rerender(undefined);

    expect(hook.latest().workletEventHandler).toBe(first);
  });
});
