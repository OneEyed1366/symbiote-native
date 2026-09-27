// Hand-ported from expo-notifications @ sdk-57 (Notifications.types.ts / Tokens.types.ts /
// NotificationChannelManager.types.ts / NotificationChannelGroupManager.types.ts /
// NotificationScheduler.types.ts) — this repo's own `I`-prefix convention for public types.
//
// PermissionResponse/PermissionStatus/PermissionExpiration come straight from
// expo-modules-core (the same precedent packages/sensors and packages/local-auth already use),
// not redeclared here.
import {
  PermissionStatus,
  type PermissionExpiration,
  type PermissionResponse,
} from 'expo-modules-core';

export { PermissionStatus };
export type { PermissionExpiration, PermissionResponse };

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/** @platform ios */
export enum IosAlertStyle {
  NONE = 0,
  BANNER = 1,
  ALERT = 2,
}

/** @platform ios */
export enum IosAllowsPreviews {
  NEVER = 0,
  ALWAYS = 1,
  WHEN_AUTHENTICATED = 2,
}

/** @platform ios */
export enum IosAuthorizationStatus {
  NOT_DETERMINED = 0,
  DENIED = 1,
  AUTHORIZED = 2,
  PROVISIONAL = 3,
  EPHEMERAL = 4,
}

export interface INotificationPermissionsStatus extends PermissionResponse {
  android?: {
    importance: number;
    interruptionFilter?: number;
  };
  ios?: {
    status: IosAuthorizationStatus;
    allowsDisplayInNotificationCenter: boolean | null;
    allowsDisplayOnLockScreen: boolean | null;
    allowsDisplayInCarPlay: boolean | null;
    allowsAlert: boolean | null;
    allowsBadge: boolean | null;
    allowsSound: boolean | null;
    allowsCriticalAlerts: boolean | null;
    alertStyle: IosAlertStyle;
    allowsPreviews: IosAllowsPreviews | null;
    providesAppNotificationSettings: boolean | null;
    allowsAnnouncements: boolean | null;
  };
}

/** @platform ios */
export interface IIosNotificationPermissionsRequest {
  allowAlert?: boolean;
  allowBadge?: boolean;
  allowSound?: boolean;
  allowDisplayInCarPlay?: boolean;
  allowCriticalAlerts?: boolean;
  provideAppNotificationSettings?: boolean;
  allowProvisional?: boolean;
}

export interface INotificationPermissionsRequest {
  ios?: IIosNotificationPermissionsRequest;
  /** On Android all permissions are granted by default; there is nothing to request. */
  android?: object;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export interface INativeDevicePushToken {
  type: 'ios' | 'android';
  data: string;
}

export type IDevicePushToken = INativeDevicePushToken;

export interface IExpoPushToken {
  type: 'expo';
  data: string;
}

export interface IExpoPushTokenOptions {
  baseUrl?: string;
  url?: string;
  type?: string;
  deviceId?: string;
  /** @platform ios */
  development?: boolean;
  /**
   * ponytail: upstream defaults this from `expo-constants`' `Constants.expoConfig.extra.eas.
   * projectId`; that package is not part of this port, so it must be passed explicitly here.
   */
  projectId?: string;
  /**
   * ponytail: upstream defaults this from `expo-application`'s `Application.applicationId`;
   * pass `@symbiote-native/application`'s own `applicationId` export, or a literal.
   */
  applicationId?: string;
  devicePushToken?: IDevicePushToken;
}

// ---------------------------------------------------------------------------
// Notification content / triggers
// ---------------------------------------------------------------------------

export type IPushNotificationTrigger = {
  type: 'push';
  /** @platform ios */
  payload?: Record<string, unknown>;
  /** @platform android */
  remoteMessage?: IFirebaseRemoteMessage;
};

/** @platform ios */
export interface ICalendarNotificationTrigger {
  type: 'calendar';
  repeats: boolean;
  dateComponents: {
    era?: number;
    year?: number;
    month?: number;
    day?: number;
    hour?: number;
    minute?: number;
    second?: number;
    weekday?: number;
    weekdayOrdinal?: number;
    quarter?: number;
    weekOfMonth?: number;
    weekOfYear?: number;
    yearForWeekOfYear?: number;
    nanosecond?: number;
    isLeapMonth: boolean;
    isRepeatedDay: boolean;
    timeZone?: string;
    calendar?: string;
  };
}

/** @platform ios */
export interface IRegion {
  type: string;
  identifier: string;
  notifyOnEntry: boolean;
  notifyOnExit: boolean;
}

/** @platform ios */
export interface ICircularRegion extends IRegion {
  type: 'circular';
  radius: number;
  center: { latitude: number; longitude: number };
}

/** @platform ios */
export interface IBeaconRegion extends IRegion {
  type: 'beacon';
  notifyEntryStateOnDisplay: boolean;
  major: number | null;
  minor: number | null;
  uuid?: string;
  beaconIdentityConstraint?: {
    uuid: string;
    major: number | null;
    minor: number | null;
  };
}

/** @platform ios */
export interface ILocationNotificationTrigger {
  type: 'location';
  repeats: boolean;
  region: ICircularRegion | IBeaconRegion;
}

export interface ITimeIntervalNotificationTrigger {
  type: 'timeInterval';
  repeats: boolean;
  seconds: number;
}

/** @platform android — iOS achieves this with a CalendarNotificationTrigger. */
export interface IDailyNotificationTrigger {
  type: 'daily';
  hour: number;
  minute: number;
}

/** @platform android */
export interface IWeeklyNotificationTrigger {
  type: 'weekly';
  weekday: number;
  hour: number;
  minute: number;
}

/** @platform android */
export interface IMonthlyNotificationTrigger {
  type: 'monthly';
  day: number;
  hour: number;
  minute: number;
}

/** @platform android */
export interface IYearlyNotificationTrigger {
  type: 'yearly';
  day: number;
  month: number;
  hour: number;
  minute: number;
}

export interface IFirebaseRemoteMessageNotification {
  body: string | null;
  bodyLocalizationArgs: string[] | null;
  bodyLocalizationKey: string | null;
  channelId: string | null;
  clickAction: string | null;
  color: string | null;
  usesDefaultLightSettings: boolean;
  usesDefaultSound: boolean;
  usesDefaultVibrateSettings: boolean;
  eventTime: number | null;
  icon: string | null;
  imageUrl: string | null;
  lightSettings: number[] | null;
  link: string | null;
  localOnly: boolean;
  notificationCount: number | null;
  notificationPriority: number | null;
  sound: string | null;
  sticky: boolean;
  tag: string | null;
  ticker: string | null;
  title: string | null;
  titleLocalizationArgs: string[] | null;
  titleLocalizationKey: string | null;
  vibrateTimings: number[] | null;
  visibility: number | null;
}

export interface IFirebaseRemoteMessage {
  collapseKey: string | null;
  data: Record<string, string>;
  from: string | null;
  messageId: string | null;
  messageType: string | null;
  originalPriority: number;
  priority: number;
  sentTime: number;
  to: string | null;
  ttl: number;
  notification: null | IFirebaseRemoteMessageNotification;
}

export interface IUnknownNotificationTrigger {
  type: 'unknown';
}

export type INotificationTrigger =
  | IPushNotificationTrigger
  | ILocationNotificationTrigger
  | INotificationTriggerInput
  | IUnknownNotificationTrigger;

export type IChannelAwareTriggerInput = { channelId: string };

export enum SchedulableTriggerInputTypes {
  CALENDAR = 'calendar',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  DATE = 'date',
  TIME_INTERVAL = 'timeInterval',
}

/** @platform ios */
export type ICalendarTriggerInput = {
  type: SchedulableTriggerInputTypes.CALENDAR;
  channelId?: string;
  repeats?: boolean;
  seconds?: number;
  timezone?: string;
  year?: number;
  month?: number;
  weekday?: number;
  weekOfMonth?: number;
  weekOfYear?: number;
  weekdayOrdinal?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
};

export type IDailyTriggerInput = {
  type: SchedulableTriggerInputTypes.DAILY;
  channelId?: string;
  hour: number;
  minute: number;
};

/** Weekdays are 1-7, with 1 = Sunday. */
export type IWeeklyTriggerInput = {
  type: SchedulableTriggerInputTypes.WEEKLY;
  channelId?: string;
  weekday: number;
  hour: number;
  minute: number;
};

export type IMonthlyTriggerInput = {
  type: SchedulableTriggerInputTypes.MONTHLY;
  channelId?: string;
  day: number;
  hour: number;
  minute: number;
};

export type IYearlyTriggerInput = {
  type: SchedulableTriggerInputTypes.YEARLY;
  channelId?: string;
  day: number;
  month: number;
  hour: number;
  minute: number;
};

export type IDateTriggerInput = {
  type: SchedulableTriggerInputTypes.DATE;
  date: Date | number;
  channelId?: string;
};

/** On iOS, a repeating time-interval trigger must be 60 seconds or greater. */
export type ITimeIntervalTriggerInput = {
  type: SchedulableTriggerInputTypes.TIME_INTERVAL;
  channelId?: string;
  repeats?: boolean;
  seconds: number;
};

export type ISchedulableNotificationTriggerInput =
  | ICalendarTriggerInput
  | ITimeIntervalTriggerInput
  | IDailyTriggerInput
  | IWeeklyTriggerInput
  | IMonthlyTriggerInput
  | IYearlyTriggerInput
  | IDateTriggerInput;

/** `null` means "deliver immediately". A `number`/`Date` is shorthand for a `DATE` trigger. */
export type INotificationTriggerInput =
  null | IChannelAwareTriggerInput | ISchedulableNotificationTriggerInput;

/** @platform android */
export enum AndroidNotificationPriority {
  MIN = 'min',
  LOW = 'low',
  DEFAULT = 'default',
  HIGH = 'high',
  MAX = 'max',
}

/** @platform ios */
export type INotificationContentAttachmentIos = {
  identifier: string | null;
  url: string | null;
  type: string | null;
  typeHint?: string;
  hideThumbnail?: boolean;
  thumbnailClipArea?: { x: number; y: number; width: number; height: number };
  thumbnailTime?: number;
};

/** @platform ios */
export type IInterruptionLevel =
  'passive' | 'active' | 'timeSensitive' | 'critical';

/** @platform ios */
export type INotificationContentIos = {
  launchImageName: string | null;
  badge: number | null;
  attachments: INotificationContentAttachmentIos[];
  summaryArgument?: string | null;
  summaryArgumentCount?: number;
  threadIdentifier: string | null;
  targetContentIdentifier?: string;
  interruptionLevel?: IInterruptionLevel;
};

/** @platform android */
export type INotificationContentAndroid = {
  badge?: number;
  /** `#AARRGGBB` or `#RRGGBB`. */
  color?: string;
  priority?: AndroidNotificationPriority;
  vibrationPattern?: number[];
};

/** As read back from native — see `INotificationContentInput` for the write-side type. */
export type INotificationContent = {
  title: string | null;
  subtitle: string | null;
  body: string | null;
  data?: Record<string, unknown>;
  categoryIdentifier: string | null;
  sound: 'default' | 'defaultCritical' | 'custom' | 'defaultRingtone' | null;
} & (INotificationContentIos | INotificationContentAndroid);

export interface INotificationRequest {
  identifier: string;
  content: INotificationContent;
  trigger: INotificationTrigger;
}

/** What you pass in to `scheduleNotificationAsync`/`presentNotificationAsync`. */
export type INotificationContentInput = {
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  data?: Record<string, unknown>;
  /** @platform ios */
  badge?: number;
  /**
   * `false` for a silent notification. On Android 8+, control sound via notification channels
   * instead. `defaultCritical`/`defaultRingtone` are iOS-only; `defaultCritical` needs the
   * critical-alerts entitlement. A custom filename must be added via `sounds` in
   * `native-link.json`'s app-level config plugin step — see this package's README.
   */
  sound?:
    boolean | 'default' | 'defaultCritical' | 'defaultRingtone' | (string & {});
  launchImageName?: string;
  /** @platform android */
  vibrate?: number[];
  /** @platform android */
  priority?: string;
  /** @platform android — `#AARRGGBB` or `#RRGGBB`. */
  color?: string;
  /** @platform android — corresponds to `Notification.Builder#setAutoCancel`. */
  autoDismiss?: boolean;
  /** @platform ios */
  categoryIdentifier?: string;
  /** @platform android — corresponds to `Notification.Builder#setOngoing`. */
  sticky?: boolean;
  /** @platform ios */
  attachments?: INotificationContentAttachmentIos[];
  /** @platform ios */
  interruptionLevel?: IInterruptionLevel;
};

export interface INotificationRequestInput {
  identifier?: string;
  content: INotificationContentInput;
  trigger: INotificationTriggerInput;
}

export interface INotification {
  date: number;
  request: INotificationRequest;
}

/** If the user tapped the notification, `actionIdentifier` equals `DEFAULT_ACTION_IDENTIFIER`. */
export interface INotificationResponse {
  notification: INotification;
  actionIdentifier: string;
  userText?: string;
}

export interface INotificationBehavior {
  /** @deprecated specify `shouldShowBanner`/`shouldShowList` instead. */
  shouldShowAlert?: boolean;
  shouldShowBanner: boolean;
  shouldShowList: boolean;
  shouldPlaySound: boolean;
  /** @platform ios */
  shouldSetBadge: boolean;
  priority?: AndroidNotificationPriority;
}

export interface INotificationAction {
  identifier: string;
  buttonTitle: string;
  textInput?: {
    /** @platform ios */
    submitButtonTitle: string;
    placeholder: string;
  };
  options?: {
    /** @platform ios */
    isDestructive?: boolean;
    /** @platform ios */
    isAuthenticationRequired?: boolean;
    /** @default true */
    opensAppToForeground?: boolean;
  };
}

/** @platform ios */
export type INotificationCategoryOptions = {
  previewPlaceholder?: string;
  intentIdentifiers?: string[];
  categorySummaryFormat?: string;
  customDismissAction?: boolean;
  allowInCarPlay?: boolean;
  showTitle?: boolean;
  showSubtitle?: boolean;
  /** @deprecated ignored by iOS. */
  allowAnnouncement?: boolean;
};

export interface INotificationCategory {
  identifier: string;
  actions: INotificationAction[];
  options?: INotificationCategoryOptions;
}

export type IMaybeNotificationResponse =
  INotificationResponse | null | undefined;

/**
 * Payload the background notification task executor receives — a `INotificationResponse` for a
 * user interaction, or a raw remote-notification payload for a headless delivery.
 */
export type INotificationTaskPayload =
  | INotificationResponse
  | {
      /** `null` for headless background notifications. */
      notification: Record<string, unknown> | null;
      data: { dataString?: string; [key: string]: unknown };
      /** @platform ios */
      aps?: Record<string, unknown>;
    };

// ---------------------------------------------------------------------------
// Android channels / channel groups
// ---------------------------------------------------------------------------

/** @platform android */
export enum AndroidNotificationVisibility {
  UNKNOWN = 0,
  PUBLIC = 1,
  PRIVATE = 2,
  SECRET = 3,
}

/** @platform android */
export enum AndroidAudioContentType {
  UNKNOWN = 0,
  SPEECH = 1,
  MUSIC = 2,
  MOVIE = 3,
  SONIFICATION = 4,
}

/** @platform android */
export enum AndroidImportance {
  UNKNOWN = 0,
  /** Use `DEFAULT` instead — present for compatibility only. */
  UNSPECIFIED = 1,
  NONE = 2,
  MIN = 3,
  LOW = 4,
  DEFAULT = 5,
  HIGH = 6,
  MAX = 7,
}

/** @platform android */
export enum AndroidAudioUsage {
  UNKNOWN = 0,
  MEDIA = 1,
  VOICE_COMMUNICATION = 2,
  VOICE_COMMUNICATION_SIGNALLING = 3,
  ALARM = 4,
  NOTIFICATION = 5,
  NOTIFICATION_RINGTONE = 6,
  NOTIFICATION_COMMUNICATION_REQUEST = 7,
  NOTIFICATION_COMMUNICATION_INSTANT = 8,
  NOTIFICATION_COMMUNICATION_DELAYED = 9,
  NOTIFICATION_EVENT = 10,
  ASSISTANCE_ACCESSIBILITY = 11,
  ASSISTANCE_NAVIGATION_GUIDANCE = 12,
  ASSISTANCE_SONIFICATION = 13,
  GAME = 14,
}

/** @platform android */
export interface IAudioAttributes {
  usage: AndroidAudioUsage;
  contentType: AndroidAudioContentType;
  flags: {
    enforceAudibility: boolean;
    requestHardwareAudioVideoSynchronization: boolean;
  };
}

export type IAudioAttributesInput = Partial<IAudioAttributes>;

/** @platform android */
export interface INotificationChannel {
  id: string;
  name: string | null;
  importance: AndroidImportance;
  bypassDnd: boolean;
  description: string | null;
  groupId?: string | null;
  lightColor: string;
  lockscreenVisibility: AndroidNotificationVisibility;
  showBadge: boolean;
  sound: 'default' | 'custom' | null;
  audioAttributes: IAudioAttributes;
  vibrationPattern: number[] | null;
  enableLights: boolean;
  enableVibrate: boolean;
}

type RequiredBy<T, K extends keyof T> = Partial<Omit<T, K>> &
  Required<Pick<T, K>>;

/** @platform android */
export type INotificationChannelInput = RequiredBy<
  Omit<INotificationChannel, 'id' | 'audioAttributes' | 'sound'> & {
    audioAttributes?: IAudioAttributesInput;
    sound?: string | null;
  },
  'name' | 'importance'
>;

/** @platform android */
export interface INotificationChannelGroup {
  id: string;
  name: string | null;
  description?: string | null;
  isBlocked?: boolean;
  channels: INotificationChannel[];
}

/** @platform android */
export interface INotificationChannelGroupInput {
  name: string | null;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// Scheduler — native-facing trigger shapes (see scheduler.ts's parseTrigger)
// ---------------------------------------------------------------------------

export interface INativeChannelAwareTriggerInput {
  type: 'channel';
  channelId?: string;
}

export interface INativeCalendarTriggerInput {
  type: 'calendar';
  channelId?: string;
  repeats?: boolean;
  timezone?: string;
  year?: number;
  month?: number;
  weekday?: number;
  weekOfMonth?: number;
  weekOfYear?: number;
  weekdayOrdinal?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
}

export interface INativeTimeIntervalTriggerInput {
  type: 'timeInterval';
  channelId?: string;
  repeats: boolean;
  seconds: number;
}

export interface INativeDailyTriggerInput {
  type: 'daily';
  channelId?: string;
  hour: number;
  minute: number;
}

export interface INativeWeeklyTriggerInput {
  type: 'weekly';
  channelId?: string;
  weekday: number;
  hour: number;
  minute: number;
}

export interface INativeYearlyTriggerInput {
  type: 'yearly';
  channelId?: string;
  day: number;
  month: number;
  hour: number;
  minute: number;
}

export interface INativeMonthlyTriggerInput {
  type: 'monthly';
  channelId?: string;
  day: number;
  hour: number;
  minute: number;
}

export interface INativeDateTriggerInput {
  type: 'date';
  channelId?: string;
  /** Milliseconds since epoch. */
  timestamp: number;
}

export type INativeNotificationTriggerInput =
  | null
  | INativeChannelAwareTriggerInput
  | INativeDateTriggerInput
  | INativeCalendarTriggerInput
  | INativeTimeIntervalTriggerInput
  | INativeDailyTriggerInput
  | INativeWeeklyTriggerInput
  | INativeMonthlyTriggerInput
  | INativeYearlyTriggerInput;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export interface INotificationHandler {
  handleNotification: (
    notification: INotification,
  ) => Promise<INotificationBehavior>;
  handleSuccess?: (notificationId: string) => void;
  handleError?: (notificationId: string, error: Error) => void;
}

// ---------------------------------------------------------------------------
// Background task
// ---------------------------------------------------------------------------

/** Corresponds to `UIBackgroundFetchResult`. @platform ios */
export enum BackgroundNotificationTaskResult {
  NewData = 0,
  NoData = 1,
  Failed = 2,
}
