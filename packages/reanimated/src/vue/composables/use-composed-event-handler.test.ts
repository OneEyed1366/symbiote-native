import { installRecordingFabric } from '@symbiote-native/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { renderComposable } from '../../../test-support/render-composable';
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
    const composable = renderComposable(() =>
      useComposedEventHandler([
        handlerFor('onScroll', first),
        handlerFor('onScroll', second),
      ]),
    );

    composable.result().workletEventHandler.worklet({ eventName: 'onScroll' });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('subscribes to the events of all of them', () => {
    const composable = renderComposable(() =>
      useComposedEventHandler([
        handlerFor('onScroll', vi.fn()),
        handlerFor('onScrollEndDrag', vi.fn()),
        null,
      ]),
    );

    expect(composable.result().workletEventHandler.eventNames).toEqual([
      'onScroll',
      'onScrollEndDrag',
    ]);
  });
});
