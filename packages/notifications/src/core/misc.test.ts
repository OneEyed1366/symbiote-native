import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_BADGE_MODULE = {
  getBadgeCountAsync: vi.fn(async () => 3),
  setBadgeCountAsync: vi.fn(async () => true),
};
const FAKE_PRESENTER_MODULE = {
  getPresentedNotificationsAsync: vi.fn(async () => []),
  dismissNotificationAsync: vi.fn(async () => undefined),
  dismissAllNotificationsAsync: vi.fn(async () => undefined),
};
const FAKE_CATEGORIES_MODULE = {
  getNotificationCategoriesAsync: vi.fn(async () => []),
  setNotificationCategoryAsync: vi.fn(async (identifier: string) => ({
    identifier,
    actions: [],
  })),
  deleteNotificationCategoryAsync: vi.fn(async () => true),
};
const FAKE_BACKGROUND_TASKS_MODULE = {
  registerTaskAsync: vi.fn(async () => null),
  unregisterTaskAsync: vi.fn(async () => null),
};

vi.mock('./native-modules', () => ({
  badgeModule: FAKE_BADGE_MODULE,
  notificationPresenterModule: FAKE_PRESENTER_MODULE,
  notificationCategoriesModule: FAKE_CATEGORIES_MODULE,
  backgroundNotificationTasksModule: FAKE_BACKGROUND_TASKS_MODULE,
}));

vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const { getBadgeCountAsync, setBadgeCountAsync } = await import('./badge');
const {
  dismissAllNotificationsAsync,
  dismissNotificationAsync,
  getPresentedNotificationsAsync,
} = await import('./presenter');
const { deleteNotificationCategoryAsync, setNotificationCategoryAsync } =
  await import('./categories');
const { registerTaskAsync, unregisterTaskAsync } =
  await import('./background-task');

afterEach(() => {
  vi.clearAllMocks();
});

describe('badge', () => {
  it('round-trips get/set', async () => {
    expect(await getBadgeCountAsync()).toBe(3);
    expect(await setBadgeCountAsync(5)).toBe(true);
    // why: badgeModule is the raw native binding (ExpoBadgeModule), not upstream's JS wrapper —
    // upstream's own BadgeModule.native.ts strips the options arg before calling the native
    // function ("omit an obsolete options argument"), so the native call is single-arg.
    expect(FAKE_BADGE_MODULE.setBadgeCountAsync).toHaveBeenCalledWith(5);
  });

  it('throws UnavailabilityError when native lacks the method (error path)', async () => {
    const original = FAKE_BADGE_MODULE.getBadgeCountAsync;
    // @ts-expect-error — simulate an unavailable platform method
    FAKE_BADGE_MODULE.getBadgeCountAsync = undefined;
    await expect(getBadgeCountAsync()).rejects.toThrow(/not available/);
    FAKE_BADGE_MODULE.getBadgeCountAsync = original;
  });
});

describe('presenter', () => {
  it('dismisses one and all notifications', async () => {
    await dismissNotificationAsync('n1');
    await dismissAllNotificationsAsync();
    expect(FAKE_PRESENTER_MODULE.dismissNotificationAsync).toHaveBeenCalledWith(
      'n1',
    );
    expect(
      FAKE_PRESENTER_MODULE.dismissAllNotificationsAsync,
    ).toHaveBeenCalled();
  });

  it('fetches presented notifications', async () => {
    expect(await getPresentedNotificationsAsync()).toEqual([]);
  });
});

describe('categories', () => {
  it('creates then deletes a category', async () => {
    const category = await setNotificationCategoryAsync('c1', []);
    expect(category.identifier).toBe('c1');

    expect(await deleteNotificationCategoryAsync('c1')).toBe(true);
  });
});

describe('background-task registration', () => {
  it('registers and unregisters a task by name', async () => {
    await registerTaskAsync('sync');
    await unregisterTaskAsync('sync');
    expect(FAKE_BACKGROUND_TASKS_MODULE.registerTaskAsync).toHaveBeenCalledWith(
      'sync',
    );
    expect(
      FAKE_BACKGROUND_TASKS_MODULE.unregisterTaskAsync,
    ).toHaveBeenCalledWith('sync');
  });
});
