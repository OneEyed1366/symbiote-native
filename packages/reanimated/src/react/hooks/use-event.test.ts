import { installRecordingFabric } from '@symbiote-native/test-utils';
import { describe, expect, it } from 'vitest';
import { renderHook } from '../../../test-support/render-hook';
import { workletOf } from '../../../test-support/worklet';
import { useEvent } from './use-event';

installRecordingFabric();

type IEvent = { eventName: string };
type IProps = { names: string[]; rebuild: boolean; hash: number };

function render(initial: IProps) {
  return renderHook(
    (props: IProps) =>
      useEvent<IEvent>(
        workletOf(() => undefined, [], props.hash),
        props.names,
        props.rebuild,
      ),
    initial,
  );
}

describe('useEvent', () => {
  it('holds a worklet event handler for the names it was given', () => {
    const hook = render({ names: ['onScroll'], rebuild: false, hash: 1 });

    expect(hook.latest().workletEventHandler.eventNames).toEqual(['onScroll']);
  });

  it('is the same handler on every render', () => {
    const hook = render({ names: ['onScroll'], rebuild: false, hash: 1 });
    const first = hook.latest().workletEventHandler;

    hook.rerender({ names: ['onScroll'], rebuild: false, hash: 1 });

    expect(hook.latest().workletEventHandler).toBe(first);
  });

  it('keeps its names while it is not told to rebuild', () => {
    const hook = render({ names: ['onScroll'], rebuild: false, hash: 1 });

    hook.rerender({ names: ['onScrollEndDrag'], rebuild: false, hash: 2 });

    expect(hook.latest().workletEventHandler.eventNames).toEqual(['onScroll']);
  });

  it('takes the new names, on the same handler, when told to rebuild', () => {
    const hook = render({ names: ['onScroll'], rebuild: false, hash: 1 });
    const first = hook.latest().workletEventHandler;

    hook.rerender({ names: ['onScrollEndDrag'], rebuild: true, hash: 2 });

    expect(hook.latest().workletEventHandler).toBe(first);
    expect(first.eventNames).toEqual(['onScrollEndDrag']);
  });
});
