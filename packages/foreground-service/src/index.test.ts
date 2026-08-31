import { afterEach, describe, expect, it, vi } from 'vitest';

const listeners = new Map<string, (payload: unknown) => void>();
const RUNNING_STATE = {
  status: 'running' as const,
  taskKey: 'voice',
  types: ['microphone' as const],
  notificationId: 7,
  startedAt: 100,
  stopReason: null,
  error: null,
};
const native = {
  start: vi.fn(async () => {}),
  updateNotification: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  getState: vi.fn(async () => RUNNING_STATE),
  addListener: vi.fn(),
  removeListeners: vi.fn(),
};

vi.mock('@symbiote-native/engine', () => ({
  getEnforcingNativeModule: () => native,
  NativeEventEmitter: class {
    addListener(event: string, listener: (payload: unknown) => void) {
      native.addListener(event);
      listeners.set(event, listener);
      return {
        remove: () => {
          listeners.delete(event);
          native.removeListeners(1);
        },
      };
    }
  },
}));

const api = await import('./index');

const OPTIONS = {
  taskKey: 'voice',
  data: { roomId: 'room-1' },
  types: ['microphone', 'mediaPlayback'] as const,
  notification: {
    channelId: 'voice',
    channelName: 'Voice',
    channelDescription: 'Voice work',
    title: 'Active',
    smallIcon: 'ic_voice',
    stopActionLabel: 'Stop',
    notificationId: 7,
  },
};

afterEach(() => {
  vi.clearAllMocks();
  listeners.clear();
});

describe('foreground service API', () => {
  it('delegates a start request to the native contract owner', async () => {
    await api.startForegroundServiceAsync(OPTIONS);
    expect(native.start).toHaveBeenCalledWith(OPTIONS);
  });

  it('updates the notification and stops through native', async () => {
    const notification = { title: 'Updated', body: 'Still active' };
    await api.updateForegroundServiceNotificationAsync(notification);
    await api.stopForegroundServiceAsync();
    expect(native.updateNotification).toHaveBeenCalledWith(notification);
    expect(native.stop).toHaveBeenCalledOnce();
  });

  it('returns the native state', async () => {
    await expect(api.getForegroundServiceStateAsync()).resolves.toBe(
      RUNNING_STATE,
    );
  });

  it('delivers lifecycle events and balances native listener counters', () => {
    const listener = vi.fn();
    const subscription = api.addForegroundServiceListener(listener);
    listeners.get('symbioteForegroundServiceStateChanged')?.({
      type: 'started',
      state: RUNNING_STATE,
    });
    expect(listener).toHaveBeenCalledOnce();
    subscription.remove();
    expect(native.addListener).toHaveBeenCalledWith(
      'symbioteForegroundServiceStateChanged',
    );
    expect(native.removeListeners).toHaveBeenCalledWith(1);
  });
});
