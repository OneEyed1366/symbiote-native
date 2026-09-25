export enum EntityTypes {
  EVENT = 'event',
  REMINDER = 'reminder',
}

export enum Frequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

/** `NOT_SUPPORTED`/`UNAVAILABLE` are iOS-only. */
export enum Availability {
  NOT_SUPPORTED = 'notSupported',
  BUSY = 'busy',
  FREE = 'free',
  TENTATIVE = 'tentative',
  UNAVAILABLE = 'unavailable',
}

/** @platform ios */
export enum CalendarType {
  LOCAL = 'local',
  CALDAV = 'caldav',
  EXCHANGE = 'exchange',
  SUBSCRIBED = 'subscribed',
  BIRTHDAYS = 'birthdays',
  UNKNOWN = 'unknown',
}

export enum EventStatus {
  NONE = 'none',
  CONFIRMED = 'confirmed',
  TENTATIVE = 'tentative',
  CANCELED = 'canceled',
}

/** @platform ios */
export enum SourceType {
  LOCAL = 'local',
  EXCHANGE = 'exchange',
  CALDAV = 'caldav',
  MOBILEME = 'mobileme',
  SUBSCRIBED = 'subscribed',
  BIRTHDAYS = 'birthdays',
}

/** iOS: UNKNOWN/REQUIRED/OPTIONAL/CHAIR/NON_PARTICIPANT. Android: the rest. */
export enum AttendeeRole {
  UNKNOWN = 'unknown',
  REQUIRED = 'required',
  OPTIONAL = 'optional',
  CHAIR = 'chair',
  NON_PARTICIPANT = 'nonParticipant',
  ATTENDEE = 'attendee',
  ORGANIZER = 'organizer',
  PERFORMER = 'performer',
  SPEAKER = 'speaker',
  NONE = 'none',
}

/** iOS: UNKNOWN/PENDING/DELEGATED/COMPLETED/IN_PROCESS. Android: INVITED/NONE. */
export enum AttendeeStatus {
  UNKNOWN = 'unknown',
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  TENTATIVE = 'tentative',
  DELEGATED = 'delegated',
  COMPLETED = 'completed',
  IN_PROCESS = 'inProcess',
  INVITED = 'invited',
  NONE = 'none',
}

/** iOS: UNKNOWN/PERSON/ROOM/GROUP. Android: OPTIONAL/REQUIRED/NONE. Both: RESOURCE. */
export enum AttendeeType {
  UNKNOWN = 'unknown',
  PERSON = 'person',
  ROOM = 'room',
  GROUP = 'group',
  RESOURCE = 'resource',
  OPTIONAL = 'optional',
  REQUIRED = 'required',
  NONE = 'none',
}

/** @platform android */
export enum AlarmMethod {
  ALARM = 'alarm',
  ALERT = 'alert',
  EMAIL = 'email',
  SMS = 'sms',
  DEFAULT = 'default',
}

/** @platform android */
export enum EventAccessLevel {
  CONFIDENTIAL = 'confidential',
  PRIVATE = 'private',
  PUBLIC = 'public',
  DEFAULT = 'default',
}

/** @platform android */
export enum CalendarAccessLevel {
  CONTRIBUTOR = 'contributor',
  EDITOR = 'editor',
  FREEBUSY = 'freebusy',
  OVERRIDE = 'override',
  OWNER = 'owner',
  READ = 'read',
  RESPOND = 'respond',
  ROOT = 'root',
  NONE = 'none',
}

/** @platform ios */
export enum ReminderStatus {
  COMPLETED = 'completed',
  INCOMPLETE = 'incomplete',
}

export enum DayOfTheWeek {
  Sunday = 1,
  Monday = 2,
  Tuesday = 3,
  Wednesday = 4,
  Thursday = 5,
  Friday = 6,
  Saturday = 7,
}

export enum MonthOfTheYear {
  January = 1,
  February = 2,
  March = 3,
  April = 4,
  May = 5,
  June = 6,
  July = 7,
  August = 8,
  September = 9,
  October = 10,
  November = 11,
  December = 12,
}

export enum CalendarDialogResultActions {
  done = 'done',
  canceled = 'canceled',
  deleted = 'deleted',
  responded = 'responded',
  saved = 'saved',
}
