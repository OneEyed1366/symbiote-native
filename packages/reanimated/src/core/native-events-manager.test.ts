import { describe, expect, it, vi } from 'vitest';
import { workletOf } from '../../test-support/worklet';
import { createEventHandler } from './event-handlers';
import { NativeEventsManager } from './native-events-manager';

const TAG = 41;
const OTHER_TAG = 42;

function handler() {
  const { workletEventHandler } = createEventHandler(
    workletOf(() => undefined, []),
    [],
  );
  vi.spyOn(workletEventHandler, 'registerForEvents');
  vi.spyOn(workletEventHandler, 'unregisterFromEvents');
  return workletEventHandler;
}

function component(props: Record<string, unknown>, tag = TAG) {
  return { props, _componentRef: undefined, getComponentViewTag: () => tag };
}

describe('the native events manager', () => {
  it('registers every worklet handler prop under the tag of the view and the prop name', () => {
    const scroll = handler();
    const manager = new NativeEventsManager(
      component({
        onScroll: { workletEventHandler: scroll },
        onPress: () => undefined,
      }),
    );

    manager.attachEvents();

    expect(scroll.registerForEvents).toHaveBeenCalledWith(TAG, 'onScroll');
  });

  it('lets go of every handler it registered when detached', () => {
    const scroll = handler();
    const manager = new NativeEventsManager(
      component({ onScroll: { workletEventHandler: scroll } }),
    );
    manager.attachEvents();

    manager.detachEvents();

    expect(scroll.unregisterFromEvents).toHaveBeenCalledWith(TAG);
  });

  it('takes the tag of the scrollable node when the ref names one', () => {
    const scroll = handler();
    const manager = new NativeEventsManager({
      props: { onScroll: { workletEventHandler: scroll } },
      _componentRef: { getScrollableNode: () => OTHER_TAG },
      getComponentViewTag: () => TAG,
    });

    manager.attachEvents();

    expect(scroll.registerForEvents).toHaveBeenCalledWith(
      OTHER_TAG,
      'onScroll',
    );
  });

  describe('when the props change', () => {
    it('lets go of a handler whose prop is gone', () => {
      const scroll = handler();
      const prev = { onScroll: { workletEventHandler: scroll } };
      const manager = new NativeEventsManager(component(prev));
      manager.attachEvents();

      const next = component({});
      const updated = new NativeEventsManager(next);
      updated.updateEvents(prev);

      expect(scroll.unregisterFromEvents).toHaveBeenCalledWith(TAG);
    });

    it('swaps a handler for the one that replaced it', () => {
      const first = handler();
      const second = handler();
      const prev = { onScroll: { workletEventHandler: first } };
      const props = { onScroll: { workletEventHandler: second } };
      const manager = new NativeEventsManager(component(props));

      manager.updateEvents(prev);

      expect(first.unregisterFromEvents).toHaveBeenCalledWith(TAG);
      expect(second.registerForEvents).toHaveBeenCalledWith(TAG, 'onScroll');
    });

    it('registers a handler whose prop was added', () => {
      const scroll = handler();
      const manager = new NativeEventsManager(
        component({ onScroll: { workletEventHandler: scroll } }),
      );

      manager.updateEvents({});

      expect(scroll.registerForEvents).toHaveBeenCalledWith(TAG, 'onScroll');
    });

    it('leaves a handler that stayed alone', () => {
      const scroll = handler();
      const props = { onScroll: { workletEventHandler: scroll } };
      const manager = new NativeEventsManager(component(props));

      manager.updateEvents(props);

      expect(scroll.registerForEvents).not.toHaveBeenCalled();
      expect(scroll.unregisterFromEvents).not.toHaveBeenCalled();
    });

    it('moves every handler to the new tag when the view under it is another one', () => {
      const scroll = handler();
      const props = { onScroll: { workletEventHandler: scroll } };
      let tag = TAG;
      const managed = {
        props,
        _componentRef: { __nativeTag: undefined as number | undefined },
        getComponentViewTag: () => tag,
      };
      const manager = new NativeEventsManager(managed);
      manager.attachEvents();
      managed._componentRef.__nativeTag = OTHER_TAG;
      tag = OTHER_TAG;

      manager.updateEvents(props);

      expect(scroll.unregisterFromEvents).toHaveBeenCalledWith(TAG);
      expect(scroll.registerForEvents).toHaveBeenLastCalledWith(
        OTHER_TAG,
        'onScroll',
      );
    });
  });
});
