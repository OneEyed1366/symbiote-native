// Ported from expo-notifications @ sdk-57's scheduleNotificationAsync.ts,
// getAllScheduledNotificationsAsync.ts, cancelScheduledNotificationAsync.ts,
// cancelAllScheduledNotificationsAsync.ts, getNextTriggerDateAsync.ts.
import { Platform, UnavailabilityError } from 'expo-modules-core';

import { dlog } from '@symbiote-native/engine';

import { notificationScheduler } from './native-modules';
import {
  SchedulableTriggerInputTypes,
  type INativeCalendarTriggerInput,
  type INativeDailyTriggerInput,
  type INativeDateTriggerInput,
  type INativeMonthlyTriggerInput,
  type INativeNotificationTriggerInput,
  type INativeTimeIntervalTriggerInput,
  type INativeWeeklyTriggerInput,
  type INativeYearlyTriggerInput,
  type INotificationRequest,
  type INotificationRequestInput,
  type INotificationTriggerInput,
  type ISchedulableNotificationTriggerInput,
} from './types';
import { hasValidTriggerObject, mapNotificationRequest } from './utils';

function uuid(): string {
  // Same fallback expo-modules-core's own `uuid.v4()` boils down to on native — a real RFC4122
  // v4 id, no extra dependency for one call site.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

type DateComponent = 'month' | 'day' | 'weekday' | 'hour' | 'minute';

function daysInMonth(month: number, year?: number): number {
  return new Date(year ?? 2000, month + 1, 0).getDate();
}

function validateDateComponents(
  trigger: Record<string, unknown>,
  components: readonly DateComponent[],
): void {
  for (const component of components) {
    if (!(component in trigger)) {
      throw new TypeError(`The ${component} parameter needs to be present`);
    }
    const value = trigger[component];
    if (typeof value !== 'number') {
      throw new TypeError(`The ${component} parameter should be a number`);
    }
    switch (component) {
      case 'month':
        if (value < 0 || value > 11) {
          throw new RangeError(
            `The month parameter needs to be between 0 and 11. Found: ${value}`,
          );
        }
        break;
      case 'day': {
        const month =
          typeof trigger.month === 'number'
            ? trigger.month
            : new Date().getMonth();
        const max = daysInMonth(month);
        if (value < 1 || value > max) {
          throw new RangeError(
            `The day parameter for month ${month} must be between 1 and ${max}. Found: ${value}`,
          );
        }
        break;
      }
      case 'weekday':
        if (value < 1 || value > 7) {
          throw new RangeError(
            `The weekday parameter needs to be between 1 and 7. Found: ${value}`,
          );
        }
        break;
      case 'hour':
        if (value < 0 || value > 23) {
          throw new RangeError(
            `The hour parameter needs to be between 0 and 23. Found: ${value}`,
          );
        }
        break;
      case 'minute':
        if (value < 0 || value > 59) {
          throw new RangeError(
            `The minute parameter needs to be between 0 and 59. Found: ${value}`,
          );
        }
        break;
    }
  }
}

/** Translates a public `INotificationTriggerInput` into the shape native expects. */
export function parseTrigger(
  trigger: INotificationTriggerInput,
): INativeNotificationTriggerInput {
  if (trigger === null) {
    return null;
  }
  if (trigger === undefined) {
    throw new TypeError(
      'Encountered an `undefined` notification trigger. Pass an explicit `null` to trigger immediately.',
    );
  }
  if (!hasValidTriggerObject(trigger)) {
    throw new TypeError(
      'The `trigger` object needs a `type` or `channelId` entry.',
    );
  }

  if ('type' in trigger) {
    if (trigger.type === SchedulableTriggerInputTypes.DATE) {
      const timestamp =
        trigger.date instanceof Date ? trigger.date.getTime() : trigger.date;
      const result: INativeDateTriggerInput = { type: 'date', timestamp };
      if (trigger.channelId) result.channelId = trigger.channelId;
      return result;
    }

    if (trigger.type === SchedulableTriggerInputTypes.CALENDAR) {
      const { repeats, ...rest } = trigger;
      return {
        ...rest,
        repeats: Boolean(repeats),
        type: 'calendar',
      } satisfies INativeCalendarTriggerInput;
    }

    if (trigger.type === SchedulableTriggerInputTypes.DAILY) {
      validateDateComponents(trigger, ['hour', 'minute']);
      const result: INativeDailyTriggerInput = {
        type: 'daily',
        hour: trigger.hour,
        minute: trigger.minute,
      };
      if (trigger.channelId) result.channelId = trigger.channelId;
      return result;
    }

    if (trigger.type === SchedulableTriggerInputTypes.WEEKLY) {
      validateDateComponents(trigger, ['weekday', 'hour', 'minute']);
      const result: INativeWeeklyTriggerInput = {
        type: 'weekly',
        weekday: trigger.weekday,
        hour: trigger.hour,
        minute: trigger.minute,
      };
      if (trigger.channelId) result.channelId = trigger.channelId;
      return result;
    }

    if (trigger.type === SchedulableTriggerInputTypes.MONTHLY) {
      validateDateComponents(trigger, ['day', 'hour', 'minute']);
      const result: INativeMonthlyTriggerInput = {
        type: 'monthly',
        day: trigger.day,
        hour: trigger.hour,
        minute: trigger.minute,
      };
      if (trigger.channelId) result.channelId = trigger.channelId;
      return result;
    }

    if (trigger.type === SchedulableTriggerInputTypes.YEARLY) {
      validateDateComponents(trigger, ['month', 'day', 'hour', 'minute']);
      const result: INativeYearlyTriggerInput = {
        type: 'yearly',
        month: trigger.month,
        day: trigger.day,
        hour: trigger.hour,
        minute: trigger.minute,
      };
      if (trigger.channelId) result.channelId = trigger.channelId;
      return result;
    }

    if (trigger.type === SchedulableTriggerInputTypes.TIME_INTERVAL) {
      const result: INativeTimeIntervalTriggerInput = {
        type: 'timeInterval',
        seconds: trigger.seconds,
        repeats: trigger.repeats ?? false,
      };
      if (trigger.channelId) result.channelId = trigger.channelId;
      return result;
    }
  }

  if (Platform.OS === 'android' && 'channelId' in trigger) {
    return { type: 'channel', channelId: trigger.channelId };
  }
  // No notion of channels off Android — deliver immediately.
  return null;
}

/** Fetches every notification currently scheduled for future delivery. */
export async function getAllScheduledNotificationsAsync(): Promise<
  INotificationRequest[]
> {
  if (!notificationScheduler.getAllScheduledNotificationsAsync) {
    throw new UnavailabilityError(
      'Notifications',
      'getAllScheduledNotificationsAsync',
    );
  }
  const requests =
    await notificationScheduler.getAllScheduledNotificationsAsync();
  return requests.map(mapNotificationRequest);
}

/** Schedules a notification. Returns the identifier used to cancel it later. */
export async function scheduleNotificationAsync(
  request: INotificationRequestInput,
): Promise<string> {
  if (!notificationScheduler.scheduleNotificationAsync) {
    throw new UnavailabilityError('Notifications', 'scheduleNotificationAsync');
  }
  const identifier = request.identifier ?? uuid();
  dlog(() => `[notifications] scheduleNotificationAsync ${identifier}`);
  return notificationScheduler.scheduleNotificationAsync(
    identifier,
    request.content,
    parseTrigger(request.trigger),
  );
}

/** Cancels one scheduled notification by its identifier. */
export async function cancelScheduledNotificationAsync(
  identifier: string,
): Promise<void> {
  if (!notificationScheduler.cancelScheduledNotificationAsync) {
    throw new UnavailabilityError(
      'Notifications',
      'cancelScheduledNotificationAsync',
    );
  }
  return notificationScheduler.cancelScheduledNotificationAsync(identifier);
}

/** Cancels every scheduled notification. */
export async function cancelAllScheduledNotificationsAsync(): Promise<void> {
  if (!notificationScheduler.cancelAllScheduledNotificationsAsync) {
    throw new UnavailabilityError(
      'Notifications',
      'cancelAllScheduledNotificationsAsync',
    );
  }
  return notificationScheduler.cancelAllScheduledNotificationsAsync();
}

/** The next Unix timestamp (ms) a schedulable trigger would fire at, or `null` if never. */
export async function getNextTriggerDateAsync(
  trigger: ISchedulableNotificationTriggerInput,
): Promise<number | null> {
  if (!notificationScheduler.getNextTriggerDateAsync) {
    throw new UnavailabilityError('Notifications', 'getNextTriggerDateAsync');
  }
  return notificationScheduler.getNextTriggerDateAsync(parseTrigger(trigger));
}
