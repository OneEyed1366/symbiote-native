import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_CHANNEL_MANAGER = {
  getNotificationChannelsAsync: vi.fn(async () => [{ id: 'default' }]),
  getNotificationChannelAsync: vi.fn(async () => ({ id: 'default' })),
  setNotificationChannelAsync: vi.fn(async (id: string) => ({ id })),
  deleteNotificationChannelAsync: vi.fn(async () => undefined),
};
const FAKE_CHANNEL_GROUP_MANAGER = {
  getNotificationChannelGroupsAsync: vi.fn(async () => []),
  getNotificationChannelGroupAsync: vi.fn(async () => null),
  setNotificationChannelGroupAsync: vi.fn(async (id: string) => ({
    id,
    channels: [],
  })),
  deleteNotificationChannelGroupAsync: vi.fn(async () => undefined),
};

const platform = { OS: 'android' as 'ios' | 'android' };

vi.mock('./native-modules', () => ({
  notificationChannelManager: FAKE_CHANNEL_MANAGER,
  notificationChannelGroupManager: FAKE_CHANNEL_GROUP_MANAGER,
}));

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  deleteNotificationChannelAsync,
  getNotificationChannelAsync,
  getNotificationChannelsAsync,
  setNotificationChannelAsync,
  setNotificationChannelGroupAsync,
} = await import('./channels');
const { AndroidImportance } = await import('./types');

afterEach(() => {
  vi.clearAllMocks();
  platform.OS = 'android';
});

describe('channels on Android', () => {
  it('forwards get/set/delete to the native channel manager', async () => {
    await getNotificationChannelsAsync();
    await setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: AndroidImportance.DEFAULT,
    });
    await deleteNotificationChannelAsync('reminders');

    expect(
      FAKE_CHANNEL_MANAGER.getNotificationChannelsAsync,
    ).toHaveBeenCalled();
    expect(
      FAKE_CHANNEL_MANAGER.setNotificationChannelAsync,
    ).toHaveBeenCalledWith('reminders', {
      name: 'Reminders',
      importance: AndroidImportance.DEFAULT,
    });
    expect(
      FAKE_CHANNEL_MANAGER.deleteNotificationChannelAsync,
    ).toHaveBeenCalledWith('reminders');
  });

  it('warns but still forwards an UNSPECIFIED importance', async () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    await setNotificationChannelAsync('x', {
      name: 'X',
      importance: AndroidImportance.UNSPECIFIED,
    });

    expect(warnSpy).toHaveBeenCalled();
    expect(FAKE_CHANNEL_MANAGER.setNotificationChannelAsync).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('creates a channel group', async () => {
    const group = await setNotificationChannelGroupAsync('g1', {
      name: 'Group 1',
    });
    expect(group?.id).toBe('g1');
  });

  it('throws UnavailabilityError when native lacks the method (error path)', async () => {
    const original = FAKE_CHANNEL_MANAGER.getNotificationChannelAsync;
    // @ts-expect-error — simulate an unavailable platform method
    FAKE_CHANNEL_MANAGER.getNotificationChannelAsync = undefined;

    await expect(getNotificationChannelAsync('x')).rejects.toThrow(
      /not available/,
    );

    FAKE_CHANNEL_MANAGER.getNotificationChannelAsync = original;
  });
});

describe('channels off Android', () => {
  it('resolves to the documented no-op values without touching native', async () => {
    platform.OS = 'ios';

    expect(await getNotificationChannelsAsync()).toEqual([]);
    expect(await getNotificationChannelAsync('x')).toBeNull();
    expect(
      await setNotificationChannelAsync('x', {
        name: 'X',
        importance: AndroidImportance.DEFAULT,
      }),
    ).toBeNull();
    await deleteNotificationChannelAsync('x');

    expect(
      FAKE_CHANNEL_MANAGER.getNotificationChannelsAsync,
    ).not.toHaveBeenCalled();
    expect(
      FAKE_CHANNEL_MANAGER.setNotificationChannelAsync,
    ).not.toHaveBeenCalled();
  });
});
