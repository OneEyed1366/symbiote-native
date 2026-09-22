import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_SCHEDULER = {
  getAllScheduledNotificationsAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(),
  cancelAllScheduledNotificationsAsync: vi.fn(),
  getNextTriggerDateAsync: vi.fn(),
};

vi.mock('./native-modules', () => ({ notificationScheduler: FAKE_SCHEDULER }));

vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

vi.mock('@symbiote-native/engine', () => ({ dlog: vi.fn() }));

const {
  cancelAllScheduledNotificationsAsync,
  cancelScheduledNotificationAsync,
  getAllScheduledNotificationsAsync,
  scheduleNotificationAsync,
  parseTrigger,
} = await import('./scheduler');
const { SchedulableTriggerInputTypes } = await import('./types');

afterEach(() => {
  vi.clearAllMocks();
});

describe('schedule / cancel round-trip', () => {
  it('schedules, receives back an identifier, then cancels it by that identifier', async () => {
    // Real native echoes back the identifier it was handed (the string this function generates
    // when the caller does not supply one) — the mock mirrors that instead of a fixed literal,
    // or the assertion below would pass whether or not the RIGHT id round-trips.
    FAKE_SCHEDULER.scheduleNotificationAsync.mockImplementation(
      async (identifier: string) => identifier,
    );

    const identifier = await scheduleNotificationAsync({
      content: { title: 'Hey' },
      trigger: {
        type: SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 60,
      },
    });

    expect(identifier).toMatch(/^[0-9a-f-]{36}$/);
    expect(FAKE_SCHEDULER.scheduleNotificationAsync).toHaveBeenCalledWith(
      identifier,
      { title: 'Hey' },
      { type: 'timeInterval', seconds: 60, repeats: false },
    );

    await cancelScheduledNotificationAsync(identifier);
    expect(
      FAKE_SCHEDULER.cancelScheduledNotificationAsync,
    ).toHaveBeenCalledWith(identifier);
  });

  it('cancels every scheduled notification', async () => {
    await cancelAllScheduledNotificationsAsync();
    expect(
      FAKE_SCHEDULER.cancelAllScheduledNotificationsAsync,
    ).toHaveBeenCalled();
  });

  it('honours an explicit identifier instead of generating one', async () => {
    FAKE_SCHEDULER.scheduleNotificationAsync.mockResolvedValue('my-id');

    await scheduleNotificationAsync({
      identifier: 'my-id',
      content: {},
      trigger: null,
    });

    expect(FAKE_SCHEDULER.scheduleNotificationAsync).toHaveBeenCalledWith(
      'my-id',
      {},
      null,
    );
  });

  it('maps the returned requests through the content mapper', async () => {
    FAKE_SCHEDULER.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'a', content: { title: 'x' }, trigger: null },
    ]);

    const requests = await getAllScheduledNotificationsAsync();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.identifier).toBe('a');
  });

  it('throws UnavailabilityError when native lacks scheduleNotificationAsync (error path)', async () => {
    const original = FAKE_SCHEDULER.scheduleNotificationAsync;
    // @ts-expect-error — simulate an unavailable platform method
    FAKE_SCHEDULER.scheduleNotificationAsync = undefined;

    await expect(
      scheduleNotificationAsync({ content: {}, trigger: null }),
    ).rejects.toThrow(/not available/);

    FAKE_SCHEDULER.scheduleNotificationAsync = original;
  });
});

describe('parseTrigger', () => {
  it('passes null through unchanged (deliver immediately)', () => {
    expect(parseTrigger(null)).toBeNull();
  });

  it('rejects an explicit undefined trigger', () => {
    // @ts-expect-error — deliberately passing the disallowed value under test
    expect(() => parseTrigger(undefined)).toThrow(/undefined/);
  });

  it('converts a Date-valued date trigger to a millisecond timestamp', () => {
    const date = new Date('2030-01-01T00:00:00.000Z');
    expect(
      parseTrigger({ type: SchedulableTriggerInputTypes.DATE, date }),
    ).toEqual({
      type: 'date',
      timestamp: date.getTime(),
    });
  });

  it('validates daily-trigger date components and rejects an out-of-range hour', () => {
    expect(() =>
      parseTrigger({
        type: SchedulableTriggerInputTypes.DAILY,
        hour: 99,
        minute: 0,
      }),
    ).toThrow(RangeError);
  });

  it('carries channelId through a weekly trigger', () => {
    expect(
      parseTrigger({
        type: SchedulableTriggerInputTypes.WEEKLY,
        weekday: 2,
        hour: 9,
        minute: 30,
        channelId: 'reminders',
      }),
    ).toEqual({
      type: 'weekly',
      weekday: 2,
      hour: 9,
      minute: 30,
      channelId: 'reminders',
    });
  });

  // Ported from expo-notifications' Notifications-test.ts trigger matrix.
  it('converts a numeric (epoch ms) date trigger unchanged', () => {
    const timestamp = Date.now();
    expect(
      parseTrigger({
        type: SchedulableTriggerInputTypes.DATE,
        date: timestamp,
      }),
    ).toEqual({ type: 'date', timestamp });
  });

  it('passes a daily trigger through unchanged', () => {
    expect(
      parseTrigger({
        type: SchedulableTriggerInputTypes.DAILY,
        hour: 12,
        minute: 30,
      }),
    ).toEqual({ type: 'daily', hour: 12, minute: 30 });
  });

  it('rejects a daily trigger minute out of range', () => {
    expect(() =>
      parseTrigger({
        type: SchedulableTriggerInputTypes.DAILY,
        hour: 12,
        minute: 70,
      }),
    ).toThrow('The minute parameter needs to be between 0 and 59. Found: 70');
  });

  it('rejects a weekly trigger weekday out of range', () => {
    expect(() =>
      parseTrigger({
        type: SchedulableTriggerInputTypes.WEEKLY,
        weekday: 8,
        hour: 12,
        minute: 30,
      }),
    ).toThrow('The weekday parameter needs to be between 1 and 7. Found: 8');
  });

  it('passes a monthly trigger through unchanged', () => {
    expect(
      parseTrigger({
        type: SchedulableTriggerInputTypes.MONTHLY,
        day: 5,
        hour: 12,
        minute: 30,
      }),
    ).toEqual({ type: 'monthly', day: 5, hour: 12, minute: 30 });
  });

  it('rejects a monthly trigger day out of range', () => {
    expect(() =>
      parseTrigger({
        type: SchedulableTriggerInputTypes.MONTHLY,
        day: 32,
        hour: 12,
        minute: 30,
      }),
    ).toThrow('Found: 32');
  });

  it('passes a yearly trigger through unchanged', () => {
    expect(
      parseTrigger({
        type: SchedulableTriggerInputTypes.YEARLY,
        day: 1,
        month: 6,
        hour: 12,
        minute: 30,
      }),
    ).toEqual({ type: 'yearly', day: 1, month: 6, hour: 12, minute: 30 });
  });

  it('rejects a yearly trigger day out of range for its month', () => {
    expect(() =>
      parseTrigger({
        type: SchedulableTriggerInputTypes.YEARLY,
        day: 32,
        month: 6,
        hour: 12,
        minute: 30,
      }),
    ).toThrow(
      'The day parameter for month 6 must be between 1 and 31. Found: 32',
    );
  });

  it('treats an immediate (null) trigger as no channel', () => {
    expect(parseTrigger(null)).toBeNull();
  });

  it('resolves a bare channelId trigger to null off Android (no notion of channels)', () => {
    // Platform.OS is mocked to 'ios' above — off Android there is no channel concept at all.
    expect(parseTrigger({ channelId: 'test-channel-id' })).toBeNull();
  });

  it('defaults a time-interval trigger to repeats: false', () => {
    expect(
      parseTrigger({
        type: SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 3600,
      }),
    ).toEqual({ type: 'timeInterval', seconds: 3600, repeats: false });
  });

  it('carries repeats: true through a time-interval trigger', () => {
    expect(
      parseTrigger({
        type: SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 3600,
        repeats: true,
      }),
    ).toEqual({ type: 'timeInterval', seconds: 3600, repeats: true });
  });

  it('defaults a calendar trigger to repeats: false and carries extra fields through', () => {
    expect(
      parseTrigger({
        type: SchedulableTriggerInputTypes.CALENDAR,
        hour: 12,
        minute: 30,
        second: 10,
      }),
    ).toEqual({
      type: 'calendar',
      repeats: false,
      hour: 12,
      minute: 30,
      second: 10,
    });
  });

  it('carries repeats: true through a calendar trigger', () => {
    expect(
      parseTrigger({
        type: SchedulableTriggerInputTypes.CALENDAR,
        hour: 12,
        minute: 30,
        second: 10,
        repeats: true,
      }),
    ).toEqual({
      type: 'calendar',
      repeats: true,
      hour: 12,
      minute: 30,
      second: 10,
    });
  });
});
