import { installRecordingFabric } from '@symbiote-native/test-utils';
import { describe, expect, it } from 'vitest';
import { renderComposable } from '../../../test-support/render-composable';
import { workletOf } from '../../../test-support/worklet';
import { useEvent } from './use-event';

installRecordingFabric();

type IEvent = { eventName: string };

function render(names: string[]) {
  return renderComposable(() =>
    useEvent<IEvent>(
      workletOf(() => undefined, [], 1),
      names,
    ),
  );
}

describe('useEvent', () => {
  it('holds a worklet event handler for the names it was given', () => {
    const composable = render(['onScroll']);

    expect(composable.result().workletEventHandler.eventNames).toEqual([
      'onScroll',
    ]);
  });
});
