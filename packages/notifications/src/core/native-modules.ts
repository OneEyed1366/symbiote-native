// Resolves expo-notifications' 13 native modules by the same names their own
// `<Module>.native.ts` one-liners use (`.vendors/expo` @ origin/sdk-57,
// `packages/expo-notifications/src/*.native.ts`) — see this package's `native-link.json` for
// the matching Android Kotlin `importPath`/`className` for each.
//
// Every method is declared optional so a call site checks availability itself and throws an
// `UnavailabilityError`, matching upstream's own per-platform capability checks rather than
// assuming every native module implements its whole surface — same pattern
// packages/task-manager/src/core/native-module.ts and packages/local-auth use.
import {
  NativeModule,
  Platform,
  requireNativeModule,
  requireOptionalNativeModule,
  type EventSubscription,
  type ProxyNativeModule,
} from 'expo-modules-core';

import type {
  INotification,
  INotificationAction,
  INotificationBehavior,
  INotificationCategory,
  INotificationCategoryOptions,
  INotificationChannel,
  INotificationChannelGroup,
  INotificationChannelGroupInput,
  INotificationChannelInput,
  INotificationContentInput,
  INotificationPermissionsRequest,
  INotificationPermissionsStatus,
  INotificationRequest,
  INotificationResponse,
  INativeNotificationTriggerInput,
} from './types';

// -- Permissions --------------------------------------------------------------------------
export interface INativePermissionsModule extends ProxyNativeModule {
  getPermissionsAsync?(): Promise<INotificationPermissionsStatus>;
  requestPermissionsAsync?(
    request: INotificationPermissionsRequest[keyof INotificationPermissionsRequest],
  ): Promise<INotificationPermissionsStatus>;
}
export const notificationPermissionsModule =
  requireNativeModule<INativePermissionsModule>(
    'ExpoNotificationPermissionsModule',
  );

// -- Push token (also an EventEmitter — onDevicePushToken) --------------------------------
export type IPushTokenManagerEvents = {
  onDevicePushToken: (params: { devicePushToken: string }) => void;
};
export class PushTokenManagerModule extends NativeModule<IPushTokenManagerEvents> {
  getDevicePushTokenAsync?(): Promise<string>;
  unregisterForNotificationsAsync?(): Promise<void>;
}
export const pushTokenManager = requireNativeModule<PushTokenManagerModule>(
  'ExpoPushTokenManager',
);

// -- Topic subscription (Android FCM topics only) ------------------------------------------
// Upstream has no iOS native module for this at all — topics are an FCM/Android-only concept —
// and resolves TopicSubscriptionModule per-platform (a real native module on Android, a plain
// no-op JS object everywhere else). requireOptionalNativeModule mirrors that: a hard
// requireNativeModule here would throw at import time on iOS before any screen code runs.
export interface INativeTopicSubscriptionModule extends ProxyNativeModule {
  subscribeToTopicAsync?(topic: string): Promise<null>;
  unsubscribeFromTopicAsync?(topic: string): Promise<null>;
}
export const topicSubscriptionModule: INativeTopicSubscriptionModule =
  Platform.OS === 'android'
    ? requireNativeModule<INativeTopicSubscriptionModule>(
        'ExpoTopicSubscriptionModule',
      )
    : (requireOptionalNativeModule<INativeTopicSubscriptionModule>(
        'ExpoTopicSubscriptionModule',
      ) ?? {});

// -- Server registration (Expo push service device-id / registration-blob storage) --------
export interface INativeServerRegistrationModule extends ProxyNativeModule {
  getInstallationIdAsync?(): Promise<string>;
  getRegistrationInfoAsync?(): Promise<string | undefined | null>;
  setRegistrationInfoAsync?(registrationInfo: string | null): Promise<void>;
}
export const serverRegistrationModule =
  requireNativeModule<INativeServerRegistrationModule>(
    'NotificationsServerRegistrationModule',
  );

// -- Presenter (tray) -----------------------------------------------------------------------
export interface INativePresenterModule extends ProxyNativeModule {
  getPresentedNotificationsAsync?(): Promise<INotification[]>;
  dismissNotificationAsync?(identifier: string): Promise<void>;
  dismissAllNotificationsAsync?(): Promise<void>;
}
export const notificationPresenterModule =
  requireNativeModule<INativePresenterModule>('ExpoNotificationPresenter');

// -- Badge ------------------------------------------------------------------------------------
export interface INativeBadgeModule extends ProxyNativeModule {
  getBadgeCountAsync?(): Promise<number>;
  setBadgeCountAsync?(badgeCount: number): Promise<boolean>;
}
export const badgeModule =
  requireNativeModule<INativeBadgeModule>('ExpoBadgeModule');

// -- Scheduler ----------------------------------------------------------------------------
export interface INativeSchedulerModule extends ProxyNativeModule {
  getAllScheduledNotificationsAsync?(): Promise<INotificationRequest[]>;
  scheduleNotificationAsync?(
    identifier: string,
    content: INotificationContentInput,
    trigger: INativeNotificationTriggerInput,
  ): Promise<string>;
  cancelScheduledNotificationAsync?(identifier: string): Promise<void>;
  cancelAllScheduledNotificationsAsync?(): Promise<void>;
  getNextTriggerDateAsync?(
    trigger: INativeNotificationTriggerInput,
  ): Promise<number>;
}
export const notificationScheduler =
  requireNativeModule<INativeSchedulerModule>('ExpoNotificationScheduler');

// -- Categories -----------------------------------------------------------------------------
export interface INativeCategoriesModule extends ProxyNativeModule {
  getNotificationCategoriesAsync?(): Promise<INotificationCategory[]>;
  setNotificationCategoryAsync?(
    identifier: string,
    actions: INotificationAction[],
    options?: INotificationCategoryOptions,
  ): Promise<INotificationCategory>;
  deleteNotificationCategoryAsync?(identifier: string): Promise<boolean>;
}
export const notificationCategoriesModule =
  requireNativeModule<INativeCategoriesModule>(
    'ExpoNotificationCategoriesModule',
  );

// -- Android channels / channel groups -----------------------------------------------------
export interface INativeChannelManagerModule extends ProxyNativeModule {
  getNotificationChannelsAsync?(): Promise<INotificationChannel[] | null>;
  getNotificationChannelAsync?(
    channelId: string,
  ): Promise<INotificationChannel | null>;
  setNotificationChannelAsync?(
    channelId: string,
    channel: INotificationChannelInput,
  ): Promise<INotificationChannel | null>;
  deleteNotificationChannelAsync?(channelId: string): Promise<void>;
}
// Android-only concept, same as topicSubscriptionModule above — a hard requireNativeModule
// here throws at import time on iOS before any screen code runs.
export const notificationChannelManager: INativeChannelManagerModule =
  Platform.OS === 'android'
    ? requireNativeModule<INativeChannelManagerModule>(
        'ExpoNotificationChannelManager',
      )
    : (requireOptionalNativeModule<INativeChannelManagerModule>(
        'ExpoNotificationChannelManager',
      ) ?? {});

export interface INativeChannelGroupManagerModule extends ProxyNativeModule {
  getNotificationChannelGroupsAsync?(): Promise<INotificationChannelGroup[]>;
  getNotificationChannelGroupAsync?(
    groupId: string,
  ): Promise<INotificationChannelGroup | null>;
  setNotificationChannelGroupAsync?(
    groupId: string,
    group: INotificationChannelGroupInput,
  ): Promise<INotificationChannelGroup | null>;
  deleteNotificationChannelGroupAsync?(groupId: string): Promise<void>;
}
export const notificationChannelGroupManager: INativeChannelGroupManagerModule =
  Platform.OS === 'android'
    ? requireNativeModule<INativeChannelGroupManagerModule>(
        'ExpoNotificationChannelGroupManager',
      )
    : (requireOptionalNativeModule<INativeChannelGroupManagerModule>(
        'ExpoNotificationChannelGroupManager',
      ) ?? {});

// -- Handler / Emitter (legacy ProxyNativeModule + LegacyEventEmitter, same as upstream) ---
export interface INativeHandlerModule extends ProxyNativeModule {
  handleNotificationAsync?(
    notificationId: string,
    behavior: INotificationBehavior,
  ): Promise<void>;
}
export const notificationsHandlerModule =
  requireNativeModule<INativeHandlerModule>('ExpoNotificationsHandlerModule');

export interface INativeEmitterModule extends ProxyNativeModule {
  getLastNotificationResponse?(): INotificationResponse | null;
  clearLastNotificationResponse?(): void;
}
export const notificationsEmitterModule =
  requireNativeModule<INativeEmitterModule>('ExpoNotificationsEmitter');

// -- Background task registration ----------------------------------------------------------
export interface INativeBackgroundTasksModule extends ProxyNativeModule {
  registerTaskAsync(taskName: string): Promise<null>;
  unregisterTaskAsync(taskName: string): Promise<null>;
}
export const backgroundNotificationTasksModule =
  requireNativeModule<INativeBackgroundTasksModule>(
    'ExpoBackgroundNotificationTasksModule',
  );

export type { EventSubscription };
