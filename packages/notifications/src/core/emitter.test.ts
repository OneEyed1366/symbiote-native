import { afterEach, describe, expect, it, vi } from 'vitest';

// A tiny fake mirroring expo-modules-core's LegacyEventEmitter surface (addListener/emit).
// The module under test constructs ONE instance at import time and this test needs to fire
// events on that exact instance — so listeners live in a SHARED static registry rather than
// per-instance state, letting a second `new FakeLegacyEventEmitter()` in the test act as a
// remote control for the module's own instance (mirrors native firing an event).
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

const FAKE_EMITTER_MODULE = {
  getLastNotificationResponse: vi.fn(),
  clearLastNotificationResponse: vi.fn(),
};

vi.mock('./native-modules', () => ({
  notificationsEmitterModule: FAKE_EMITTER_MODULE,
}));

vi.mock('expo-modules-core', () => ({
  LegacyEventEmitter: FakeLegacyEventEmitter,
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

vi.mock('@symbiote-native/engine', () => ({ dlog: vi.fn() }));

const {
  addNotificationReceivedListener,
  clearLastNotificationResponse,
  getLastNotificationResponse,
} = await import('./emitter');

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
});

describe('addNotificationReceivedListener — add/remove', () => {
  it('delivers a received notification to the listener, mapped through mapNotification', () => {
    const listener = vi.fn();
    addNotificationReceivedListener(listener);

    // A second instance shares the fake's static listener registry with the module's own
    // instance — firing on it simulates native delivering the event.
    new FakeLegacyEventEmitter().emit(
      'onDidReceiveNotification',
      FAKE_NOTIFICATION,
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]?.request.identifier).toBe('n1');
  });

  it('stops delivery once removed', () => {
    const listener = vi.fn();
    const subscription = addNotificationReceivedListener(listener);
    subscription.remove();

    new FakeLegacyEventEmitter().emit(
      'onDidReceiveNotification',
      FAKE_NOTIFICATION,
    );

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('getLastNotificationResponse', () => {
  it('returns null when there is none', () => {
    FAKE_EMITTER_MODULE.getLastNotificationResponse.mockReturnValue(null);
    expect(getLastNotificationResponse()).toBeNull();
  });

  it('maps a present response through mapNotification', () => {
    FAKE_EMITTER_MODULE.getLastNotificationResponse.mockReturnValue({
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      notification: FAKE_NOTIFICATION,
    });

    const response = getLastNotificationResponse();

    expect(response?.notification.request.identifier).toBe('n1');
  });

  it('throws UnavailabilityError when native lacks the method (error path)', () => {
    const original = FAKE_EMITTER_MODULE.getLastNotificationResponse;
    // @ts-expect-error — simulate a platform where the native module omits this method
    FAKE_EMITTER_MODULE.getLastNotificationResponse = undefined;

    expect(() => getLastNotificationResponse()).toThrow(/not available/);

    FAKE_EMITTER_MODULE.getLastNotificationResponse = original;
  });
});

describe('clearLastNotificationResponse', () => {
  it('calls through to native', () => {
    clearLastNotificationResponse();
    expect(
      FAKE_EMITTER_MODULE.clearLastNotificationResponse,
    ).toHaveBeenCalled();
  });
});
