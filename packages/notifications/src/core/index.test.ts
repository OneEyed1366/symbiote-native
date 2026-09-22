import { describe, expect, it, vi } from 'vitest';

// The barrel transitively touches every native-module resolution and both LegacyEventEmitter
// consumers (handler/emitter) — stub the whole surface just to let the module graph load, same
// convention every other *.test.ts in this package uses per-module.
class FakeLegacyEventEmitter {
  addListener() {
    return { remove: vi.fn() };
  }
}

vi.mock('./native-modules', () => ({
  notificationPermissionsModule: {},
  pushTokenManager: { addListener: vi.fn(() => ({ remove: vi.fn() })) },
  topicSubscriptionModule: {},
  serverRegistrationModule: {},
  notificationPresenterModule: {},
  badgeModule: {},
  notificationScheduler: {},
  notificationCategoriesModule: {},
  notificationChannelManager: {},
  notificationChannelGroupManager: {},
  notificationsHandlerModule: {},
  notificationsEmitterModule: {},
  backgroundNotificationTasksModule: {},
}));

vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  LegacyEventEmitter: FakeLegacyEventEmitter,
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
  CodedError: class CodedError extends Error {},
  UnavailabilityError: class UnavailabilityError extends Error {},
}));

vi.mock('@symbiote-native/engine', () => ({ dlog: vi.fn() }));

const Notifications = await import('./index');

// Ported from expo-notifications' index-test.ts (the snapshot half of that file tracks
// upstream's own export surface — not portable; this pins the one concrete assertion).
describe('package barrel exports', () => {
  it('includes IosAuthorizationStatus export', () => {
    expect(Notifications.IosAuthorizationStatus).toBeDefined();
  });

  it('includes every documented top-level function and enum', () => {
    const expectedFunctions = [
      'getPermissionsAsync',
      'requestPermissionsAsync',
      'addPushTokenListener',
      'getDevicePushTokenAsync',
      'getExpoPushTokenAsync',
      'setAutoServerRegistrationEnabledAsync',
      'unregisterForNotificationsAsync',
      'subscribeToTopicAsync',
      'unsubscribeFromTopicAsync',
      'getPresentedNotificationsAsync',
      'dismissNotificationAsync',
      'dismissAllNotificationsAsync',
      'getBadgeCountAsync',
      'setBadgeCountAsync',
      'scheduleNotificationAsync',
      'getAllScheduledNotificationsAsync',
      'cancelScheduledNotificationAsync',
      'cancelAllScheduledNotificationsAsync',
      'getNextTriggerDateAsync',
      'getNotificationCategoriesAsync',
      'setNotificationCategoryAsync',
      'deleteNotificationCategoryAsync',
      'getNotificationChannelsAsync',
      'getNotificationChannelAsync',
      'setNotificationChannelAsync',
      'deleteNotificationChannelAsync',
      'getNotificationChannelGroupsAsync',
      'getNotificationChannelGroupAsync',
      'setNotificationChannelGroupAsync',
      'deleteNotificationChannelGroupAsync',
      'setNotificationHandler',
      'addNotificationReceivedListener',
      'addNotificationsDroppedListener',
      'addNotificationResponseReceivedListener',
      'getLastNotificationResponse',
      'clearLastNotificationResponse',
      'addNotificationResponseClearedListener',
      'registerTaskAsync',
      'unregisterTaskAsync',
    ] as const;

    for (const name of expectedFunctions) {
      expect(Notifications[name], name).toBeTypeOf('function');
    }

    expect(Notifications.DEFAULT_ACTION_IDENTIFIER).toBeTypeOf('string');
  });
});
