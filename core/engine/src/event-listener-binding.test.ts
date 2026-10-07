import { describe, expect, it, vi } from 'vitest';
import { bindEventListener } from './event-listener-binding';
import type { IEventEmitterOf, IEventsMap } from './event-listener-binding';

type IPlayerEvents = {
  statusChange: (event: { status: string }) => void;
  volumeChange: (event: { volume: number }, previous: number) => void;
};

function fakeEmitter() {
  const listeners = new Map<string, (...args: never[]) => unknown>();
  const remove = vi.fn();
  const emitter: IEventEmitterOf<IPlayerEvents> = {
    addListener: (name, listener) => {
      listeners.set(name, listener);
      return { remove };
    },
  };
  const emit = (name: string, ...args: unknown[]): void => {
    const listener = listeners.get(name);
    if (!listener) throw new Error(`no listener for ${name}`);
    Reflect.apply(listener, undefined, args);
  };
  return { emitter, emit, remove };
}

// Same shape as the `SharedObject` of expo-modules-core: a class generic over its events
class ClassEmitter<TEvents extends IEventsMap> {
  addListener<TName extends keyof TEvents>(
    _eventName: TName,
    _listener: TEvents[TName],
  ): { remove(): void } {
    return { remove: () => undefined };
  }
}

describe('IEventEmitterOf', () => {
  it('fits a class emitter when the events are named', () => {
    const emitter: IEventEmitterOf<IPlayerEvents> =
      new ClassEmitter<IPlayerEvents>();

    expect(emitter.addListener('statusChange', () => undefined)).toHaveProperty(
      'remove',
    );
  });
});

describe('bindEventListener', () => {
  it('subscribes to the named event and gives the listener the payload', () => {
    const { emitter, emit } = fakeEmitter();
    const received: unknown[] = [];

    bindEventListener(
      emitter,
      'statusChange',
      () => event => received.push(event),
    );
    emit('statusChange', { status: 'ready' });

    expect(received).toEqual([{ status: 'ready' }]);
  });

  it('passes every argument of the event', () => {
    const { emitter, emit } = fakeEmitter();
    const listener = vi.fn();

    bindEventListener(emitter, 'volumeChange', () => listener);
    emit('volumeChange', { volume: 1 }, 0);

    expect(listener).toHaveBeenCalledWith({ volume: 1 }, 0);
  });

  it('calls the latest listener without subscribing again', () => {
    const { emitter, emit } = fakeEmitter();
    const first = vi.fn();
    const second = vi.fn();
    let current = first;

    bindEventListener(emitter, 'statusChange', () => current);
    current = second;
    emit('statusChange', { status: 'x' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('answers a function that removes the subscription', () => {
    const { emitter, remove } = fakeEmitter();

    const unbind = bindEventListener(emitter, 'statusChange', () => vi.fn());
    unbind();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
