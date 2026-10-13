import { installRecordingFabric } from '@symbiote-native/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkletEventHandler } from 'react-native-reanimated/src/WorkletEventHandler';
import { renderComposable } from '../../../test-support/render-composable';
import type { IAnimatedRef } from '../../core/animated-ref';
import { createSharedValue } from '../../core/shared-value';
import { useScrollOffset } from './use-scroll-offset';

installRecordingFabric();

type IHandler = WorkletEventHandler<object>;

// The handler the composable builds is internal, so it is caught as it registers for a tag
const registered: Array<{ tag: number; handler: IHandler }> = [];

vi.spyOn(WorkletEventHandler.prototype, 'registerForEvents').mockImplementation(
  function (this: IHandler, tag: number) {
    registered.push({ tag, handler: this });
  },
);

afterEach(() => registered.splice(0));

// Just the half of an animated ref the composable looks at
function observableRef() {
  const cleanups = new Map<
    (tag: number | null) => void | (() => void),
    void | (() => void)
  >();
  const ref: Pick<IAnimatedRef, 'observe'> = {
    observe: observer => {
      cleanups.set(observer, undefined);
      return () => {
        cleanups.get(observer)?.();
        cleanups.delete(observer);
      };
    },
  };
  return {
    ref,
    attach: (tag: number | null) => {
      for (const observer of cleanups.keys()) {
        cleanups.set(observer, observer(tag));
      }
    },
  };
}

function scroll(x: number, y: number) {
  return { eventName: 'onScroll', contentOffset: { x, y } };
}

describe('useScrollOffset', () => {
  it('starts at zero', () => {
    const { ref } = observableRef();

    const composable = renderComposable(() => useScrollOffset(ref));

    expect(composable.result().value).toBe(0);
  });

  it('is the shared value it was given, when it was given one', () => {
    const { ref } = observableRef();
    const { shared } = createSharedValue(7);

    const composable = renderComposable(() => useScrollOffset(ref, shared));

    expect(composable.result()).toBe(shared);
  });

  it('registers for the tag of the ref, once it has one', () => {
    const { ref, attach } = observableRef();
    renderComposable(() => useScrollOffset(ref));
    expect(registered).toHaveLength(0);

    attach(5);

    expect(registered.map(entry => entry.tag)).toEqual([5]);
  });

  it('follows the vertical offset of a scroll event', () => {
    const { ref, attach } = observableRef();
    const composable = renderComposable(() => useScrollOffset(ref));
    attach(5);

    registered[0]?.handler.worklet(scroll(0, 40));

    expect(composable.result().value).toBe(40);
  });

  it('follows the horizontal offset when there is one', () => {
    const { ref, attach } = observableRef();
    const composable = renderComposable(() => useScrollOffset(ref));
    attach(5);

    registered[0]?.handler.worklet(scroll(25, 40));

    expect(composable.result().value).toBe(25);
  });

  it('listens for nothing when there is no ref', () => {
    renderComposable(() => useScrollOffset(null));

    expect(registered).toHaveLength(0);
  });
});
