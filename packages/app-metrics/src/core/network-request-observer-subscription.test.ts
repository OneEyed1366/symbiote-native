import { describe, expect, it, vi } from 'vitest';
import {
  filterKeyOf,
  subscribeNetworkRequestObserverEvents,
} from './network-request-observer-subscription';

type IListener = (payload: unknown) => void;

function createFakeObserver(): {
  observer: {
    addListener: (event: string, listener: IListener) => { remove: () => void };
  };
  emit: (event: string, payload: unknown) => void;
  removeSpies: Record<string, ReturnType<typeof vi.fn>>;
} {
  const listenersByEvent = new Map<string, IListener>();
  const removeSpies: Record<string, ReturnType<typeof vi.fn>> = {};
  return {
    observer: {
      addListener: (event, listener) => {
        listenersByEvent.set(event, listener);
        const removeSpy = vi.fn();
        removeSpies[event] = removeSpy;
        return { remove: removeSpy };
      },
    },
    emit: (event, payload) => listenersByEvent.get(event)?.(payload),
    removeSpies,
  };
}

describe('filterKeyOf (Positive: same key regardless of property order, distinct otherwise)', () => {
  it('produces the same key for the same filter with reordered properties', () => {
    expect(filterKeyOf({ hosts: ['a'], methods: ['GET'] })).toBe(
      filterKeyOf({ methods: ['GET'], hosts: ['a'] }),
    );
  });

  it('produces the same key for null and undefined', () => {
    expect(filterKeyOf(null)).toBe(filterKeyOf(undefined));
  });

  it('produces a different key for a different filter', () => {
    expect(filterKeyOf({ hosts: ['a'] })).not.toBe(
      filterKeyOf({ hosts: ['b'] }),
    );
  });
});

describe('subscribeNetworkRequestObserverEvents (Positive: forwards events to the latest callbacks, cleans up)', () => {
  it('forwards a requestStarted event to the current onStarted callback', () => {
    const { observer, emit } = createFakeObserver();
    const onStarted = vi.fn();

    subscribeNetworkRequestObserverEvents(observer, () => ({ onStarted }));
    emit('requestStarted', { id: '1' });

    expect(onStarted).toHaveBeenCalledWith({ id: '1' });
  });

  it('forwards a requestCompleted event to the current onCompleted callback', () => {
    const { observer, emit } = createFakeObserver();
    const onCompleted = vi.fn();

    subscribeNetworkRequestObserverEvents(observer, () => ({ onCompleted }));
    emit('requestCompleted', { id: '1', statusCode: 200 });

    expect(onCompleted).toHaveBeenCalledWith({ id: '1', statusCode: 200 });
  });

  it('reads callbacks fresh on every event, not just at subscribe time', () => {
    const { observer, emit } = createFakeObserver();
    let onStarted = vi.fn();

    subscribeNetworkRequestObserverEvents(observer, () => ({ onStarted }));
    const secondCallback = vi.fn();
    onStarted = secondCallback;
    emit('requestStarted', { id: '1' });

    expect(secondCallback).toHaveBeenCalledWith({ id: '1' });
  });

  it('removes both subscriptions when the returned cleanup runs', () => {
    const { observer, removeSpies } = createFakeObserver();

    const unsubscribe = subscribeNetworkRequestObserverEvents(
      observer,
      () => ({}),
    );
    unsubscribe();

    expect(removeSpies.requestStarted).toHaveBeenCalledTimes(1);
    expect(removeSpies.requestCompleted).toHaveBeenCalledTimes(1);
  });
});
