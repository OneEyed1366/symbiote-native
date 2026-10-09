import { describe, expect, it, vi } from 'vitest';
import { logger } from 'react-native-reanimated/src/common';
import { workletOf } from '../../test-support/worklet';
import { createEventHandler } from './event-handlers';
import {
  observeScrollOffset,
  scrollDispatcher,
  scrollEventNames,
} from './scroll';
import type { IAnimatedRef } from './animated-ref';

function scrollEvent(eventName: string) {
  return {
    eventName,
    contentOffset: { x: 0, y: 40 },
  };
}

describe('the events a scroll handler subscribes to', () => {
  it('always include the scroll itself', () => {
    expect(scrollEventNames({ onBeginDrag: () => undefined })).toContain(
      'onScroll',
    );
  });

  it('add one event per extra handler given, and no others', () => {
    const names = scrollEventNames({
      onScroll: () => undefined,
      onEndDrag: () => undefined,
      onMomentumEnd: () => undefined,
    });

    expect(names).toEqual([
      'onScroll',
      'onScrollEndDrag',
      'onMomentumScrollEnd',
    ]);
  });
});

describe('the dispatcher of a scroll handler', () => {
  it('calls the handler of the event that arrived, with the shared context', () => {
    const onScroll = vi.fn();
    const onEndDrag = vi.fn();
    const context = { seen: 0 };
    const dispatch = scrollDispatcher({ onScroll, onEndDrag }, context);

    dispatch(scrollEvent('onScrollEndDrag'));

    expect(onEndDrag).toHaveBeenCalledWith(
      scrollEvent('onScrollEndDrag'),
      context,
    );
    expect(onScroll).not.toHaveBeenCalled();
  });

  it('tells a scroll from a drag by the name the event ends with', () => {
    const onScroll = vi.fn();
    const dispatch = scrollDispatcher({ onScroll }, {});

    dispatch(scrollEvent('onScroll'));

    expect(onScroll).toHaveBeenCalledTimes(1);
  });

  it('ignores an event that is not a scroll event', () => {
    const onScroll = vi.fn();
    const dispatch = scrollDispatcher({ onScroll }, {});

    dispatch(scrollEvent('onLayout'));

    expect(onScroll).not.toHaveBeenCalled();
  });

  it('ignores an event it has no handler for', () => {
    const onScroll = vi.fn();
    const dispatch = scrollDispatcher({ onScroll }, {});

    dispatch(scrollEvent('onMomentumScrollEnd'));

    expect(onScroll).not.toHaveBeenCalled();
  });
});

function fakeRef(): {
  ref: Pick<IAnimatedRef, 'observe'>;
  attach: (tag: number | null) => void;
} {
  const cleanups = new Map<
    (tag: number | null) => void | (() => void),
    void | (() => void)
  >();
  return {
    ref: {
      observe: observer => {
        cleanups.set(observer, undefined);
        return () => {
          cleanups.get(observer)?.();
          cleanups.delete(observer);
        };
      },
    },
    attach: tag => {
      for (const observer of cleanups.keys())
        cleanups.set(observer, observer(tag));
    },
  };
}

function handlerSpy() {
  const { workletEventHandler } = createEventHandler(
    workletOf(() => undefined, []),
    ['onScroll'],
  );
  vi.spyOn(workletEventHandler, 'registerForEvents');
  vi.spyOn(workletEventHandler, 'unregisterFromEvents');
  return { workletEventHandler };
}

describe('observing the scroll offset of an animated ref', () => {
  it('registers the handler for the tag once the ref has one', () => {
    const { ref, attach } = fakeRef();
    const handler = handlerSpy();
    observeScrollOffset(ref, handler);

    attach(7);

    expect(handler.workletEventHandler.registerForEvents).toHaveBeenCalledWith(
      7,
    );
  });

  it('warns, and registers nothing, while the ref is not attached', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const { ref, attach } = fakeRef();
    const handler = handlerSpy();
    observeScrollOffset(ref, handler);

    attach(null);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('animatedRef is not initialized'),
    );
    expect(
      handler.workletEventHandler.registerForEvents,
    ).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('unregisters from the tag when the observer is let go', () => {
    const { ref, attach } = fakeRef();
    const handler = handlerSpy();
    const stop = observeScrollOffset(ref, handler);
    attach(7);

    stop();

    expect(
      handler.workletEventHandler.unregisterFromEvents,
    ).toHaveBeenCalledWith(7);
  });
});
