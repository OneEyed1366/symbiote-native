import { afterEach, describe, expect, it, vi } from 'vitest';

// Shared static registry, same reasoning as emitter.test.ts — the module under test constructs
// one LegacyEventEmitter instance at import time and this test needs to fire on that instance.
class FakeLegacyEventEmitter {
  private static listeners = new Map<string, Set<(event: unknown) => void>>();
  addListener<T>(eventName: string, listener: (event: T) => void) {
    const set = FakeLegacyEventEmitter.listeners.get(eventName) ?? new Set();
    set.add(listener as (event: unknown) => void);
    FakeLegacyEventEmitter.listeners.set(eventName, set);
    return {
      remove: vi.fn(() => set.delete(listener as (event: unknown) => void)),
    };
  }
  emit(eventName: string, ...args: unknown[]) {
    for (const listener of FakeLegacyEventEmitter.listeners.get(eventName) ??
      [])
      listener(args[0]);
  }
}

const FAKE_HANDLER_MODULE = {
  handleNotificationAsync: vi.fn(async () => undefined),
};

vi.mock('./native-modules', () => ({
  notificationsHandlerModule: FAKE_HANDLER_MODULE,
}));

vi.mock('expo-modules-core', () => ({
  LegacyEventEmitter: FakeLegacyEventEmitter,
  CodedError: class CodedError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock('@symbiote-native/engine', () => ({ dlog: vi.fn() }));

const { setNotificationHandler } = await import('./handler');

const FAKE_NOTIFICATION = {
  date: 1_700_000_000_000,
  request: {
    identifier: 'n1',
    content: {
      title: 'Hi',
      subtitle: null,
      body: null,
      categoryIdentifier: null,
      sound: null,
    },
    trigger: null,
  },
};

afterEach(() => {
  vi.clearAllMocks();
  setNotificationHandler(null);
});

describe('setNotificationHandler', () => {
  it('calls handleNotificationAsync with the handler-produced behavior, then handleSuccess', async () => {
    const behavior = {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
    const handleNotification = vi.fn(async () => behavior);
    const handleSuccess = vi.fn();
    setNotificationHandler({ handleNotification, handleSuccess });

    new FakeLegacyEventEmitter().emit('onHandleNotification', {
      id: 'n1',
      notification: FAKE_NOTIFICATION,
    });
    await vi.waitFor(() => expect(handleSuccess).toHaveBeenCalledWith('n1'));

    expect(handleNotification).toHaveBeenCalled();
    expect(FAKE_HANDLER_MODULE.handleNotificationAsync).toHaveBeenCalledWith(
      'n1',
      behavior,
    );
  });

  it('calls handleError when the handler itself throws (error path)', async () => {
    const handleError = vi.fn();
    setNotificationHandler({
      handleNotification: async () => {
        throw new Error('boom');
      },
      handleError,
    });

    new FakeLegacyEventEmitter().emit('onHandleNotification', {
      id: 'n2',
      notification: FAKE_NOTIFICATION,
    });
    await vi.waitFor(() => expect(handleError).toHaveBeenCalled());

    expect(handleError.mock.calls[0]?.[0]).toBe('n2');
    expect(handleError.mock.calls[0]?.[1]).toBeInstanceOf(Error);
  });

  it('calls handleError with a NotificationTimeoutError on a native timeout', async () => {
    const handleError = vi.fn();
    setNotificationHandler({
      handleNotification: async () => ({}) as never,
      handleError,
    });

    new FakeLegacyEventEmitter().emit('onHandleNotificationTimeout', {
      id: 'n3',
      notification: FAKE_NOTIFICATION,
    });

    expect(handleError).toHaveBeenCalledTimes(1);
    expect(handleError.mock.calls[0]?.[0]).toBe('n3');
    expect(handleError.mock.calls[0]?.[1]?.info.id).toBe('n3');
  });

  it('clearing (passing null) removes both subscriptions — a later event reaches nobody', () => {
    const handleNotification = vi.fn(async () => ({}) as never);
    setNotificationHandler({ handleNotification });
    setNotificationHandler(null);

    new FakeLegacyEventEmitter().emit('onHandleNotification', {
      id: 'n4',
      notification: FAKE_NOTIFICATION,
    });

    expect(handleNotification).not.toHaveBeenCalled();
  });
});
