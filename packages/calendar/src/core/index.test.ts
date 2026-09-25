import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fakes are real ES classes (not plain object mocks) so our wrapper classes can `extend` them -
// see @symbiote-native/file-system's src/next/next.test.ts for the same shape.

class FakeNativeExpoCalendarAttendee {
  id?: string;
  name?: string;
  email?: string;
  deleted = false;

  constructor(record: Record<string, unknown> = {}) {
    Object.assign(this, record);
    this.id ??= 'attendee-1';
  }

  update = vi.fn(
    async (patch: Record<string, unknown>, nullableFields: string[]) => {
      Object.assign(this, patch);
      for (const field of nullableFields)
        (this as Record<string, unknown>)[field] = null;
    },
  );

  delete = vi.fn(async () => {
    this.deleted = true;
  });
}

class FakeNativeExpoCalendarReminder {
  id?: string;
  title?: string;
  completed = false;
  deleted = false;

  constructor(id?: string) {
    this.id = id ?? 'reminder-1';
  }

  update = vi.fn(
    async (patch: Record<string, unknown>, nullableFields: string[]) => {
      Object.assign(this, patch);
      for (const field of nullableFields)
        (this as Record<string, unknown>)[field] = null;
    },
  );

  delete = vi.fn(async () => {
    this.deleted = true;
  });
}

class FakeNativeExpoCalendarEvent {
  id?: string;
  calendarId?: string;
  title?: string;
  deleted = false;

  constructor(record: Record<string, unknown> = {}) {
    Object.assign(this, record);
    this.id ??= 'event-1';
  }

  createAttendee = vi.fn(async (record: Record<string, unknown>) => {
    return new FakeNativeExpoCalendarAttendee(record);
  });

  openInCalendar = vi.fn(async () => ({ action: 'opened', id: this.id }));
  editInCalendar = vi.fn(async () => ({ action: 'edited', id: this.id }));

  getOccurrenceSync = vi.fn((options?: { instanceStartDate?: string }) => {
    return new FakeNativeExpoCalendarEvent({
      ...this,
      startDate: options?.instanceStartDate ?? this.id,
    });
  });

  getAttendees = vi.fn(async () => [
    new FakeNativeExpoCalendarAttendee({ id: 'attendee-1' }),
  ]);

  update = vi.fn(
    async (patch: Record<string, unknown>, nullableFields: string[]) => {
      Object.assign(this, patch);
      for (const field of nullableFields)
        (this as Record<string, unknown>)[field] = null;
    },
  );

  delete = vi.fn(async () => {
    this.deleted = true;
  });
}

class FakeNativeExpoCalendar {
  id?: string;
  title?: string;
  deleted = false;

  constructor(record: Record<string, unknown> = {}) {
    Object.assign(this, record);
    this.id ??= 'calendar-1';
  }

  listEvents = vi.fn(async (startDate: string, endDate: string) => [
    new FakeNativeExpoCalendarEvent({
      id: 'event-1',
      calendarId: this.id,
      startDate,
      endDate,
    }),
  ]);

  listReminders = vi.fn(async () => [
    new FakeNativeExpoCalendarReminder('reminder-1'),
  ]);

  createEvent = vi.fn(async (record: Record<string, unknown>) => {
    return new FakeNativeExpoCalendarEvent({ calendarId: this.id, ...record });
  });

  createReminder = vi.fn(async (_record: Record<string, unknown>) => {
    return new FakeNativeExpoCalendarReminder('reminder-1');
  });

  addEventWithForm = vi.fn(async () => ({ action: 'saved', id: 'event-1' }));

  update = vi.fn(async (patch: Record<string, unknown>) => {
    Object.assign(this, patch);
  });

  delete = vi.fn(async () => {
    this.deleted = true;
  });
}

const FAKE_MODULE = {
  ExpoCalendar: FakeNativeExpoCalendar,
  ExpoCalendarEvent: FakeNativeExpoCalendarEvent,
  ExpoCalendarAttendee: FakeNativeExpoCalendarAttendee,
  ExpoCalendarReminder: FakeNativeExpoCalendarReminder,
  getCalendars: vi.fn(async () => [
    new FakeNativeExpoCalendar({ id: 'calendar-1' }),
  ]),
  getCalendarById: vi.fn(
    async (id: string) => new FakeNativeExpoCalendar({ id }),
  ),
  createCalendar: vi.fn(
    async (record: Record<string, unknown>) =>
      new FakeNativeExpoCalendar(record),
  ),
  listEvents: vi.fn(async () => [
    new FakeNativeExpoCalendarEvent({ id: 'event-1' }),
  ]),
  getEventById: vi.fn(
    async (id: string) => new FakeNativeExpoCalendarEvent({ id }),
  ),
  getCalendarPermissions: vi.fn(async () => ({
    granted: true,
    status: 'granted',
    canAskAgain: true,
    expires: 'never',
  })),
  requestCalendarPermissions: vi.fn(async () => ({
    granted: true,
    status: 'granted',
    canAskAgain: true,
    expires: 'never',
  })),
  getDefaultCalendarSync: vi.fn(
    () => new FakeNativeExpoCalendar({ id: 'default-calendar' }),
  ),
  presentPicker: vi.fn(
    async () => new FakeNativeExpoCalendar({ id: 'picked-calendar' }),
  ),
  getReminderById: vi.fn(
    async (id: string) => new FakeNativeExpoCalendarReminder(id),
  ),
  getRemindersPermissions: vi.fn(async () => ({
    granted: true,
    status: 'granted',
    canAskAgain: true,
    expires: 'never',
  })),
  requestRemindersPermissions: vi.fn(async () => ({
    granted: true,
    status: 'granted',
    canAskAgain: true,
    expires: 'never',
  })),
  getSourcesSync: vi.fn(() => [{ id: 'source-1', name: 'iCloud' }]),
};

vi.mock('./native-module', () => ({ expoCalendarNext: FAKE_MODULE }));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse - same fake
// packages/network/src/core/network.test.ts uses.
vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const { ExpoCalendar } = await import('./calendar');
const { ExpoCalendarEvent } = await import('./event');
const { ExpoCalendarAttendee } = await import('./attendee');
const { ExpoCalendarReminder } = await import('./reminder');
const {
  getCalendarPermissionsAsync,
  requestCalendarPermissionsAsync,
  getRemindersPermissionsAsync,
  requestRemindersPermissionsAsync,
} = await import('./permissions');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ExpoCalendar', () => {
  it('lists all calendars, upgraded to the wrapper class', async () => {
    const calendars = await ExpoCalendar.getAllAsync();
    expect(calendars[0]).toBeInstanceOf(ExpoCalendar);
    expect(FAKE_MODULE.getCalendars).toHaveBeenCalledWith(null);
  });

  it('filters by entity type when provided', async () => {
    await ExpoCalendar.getAllAsync('event' as never);
    expect(FAKE_MODULE.getCalendars).toHaveBeenCalledWith('event');
  });

  it('finds a calendar by id', async () => {
    const calendar = await ExpoCalendar.getByIdAsync('calendar-1');
    expect(calendar).toBeInstanceOf(ExpoCalendar);
    expect(calendar.id).toBe('calendar-1');
  });

  it('creates a calendar from input', async () => {
    const calendar = await ExpoCalendar.createAsync({ title: 'Work' });
    expect(calendar).toBeInstanceOf(ExpoCalendar);
    expect(FAKE_MODULE.createCalendar).toHaveBeenCalledWith({ title: 'Work' });
  });

  it('resolves the default calendar synchronously', () => {
    const calendar = ExpoCalendar.getDefaultSync();
    expect(calendar).toBeInstanceOf(ExpoCalendar);
    expect(calendar.id).toBe('default-calendar');
  });

  it('presents the native calendar picker', async () => {
    const calendar = await ExpoCalendar.presentPickerAsync();
    expect(calendar).toBeInstanceOf(ExpoCalendar);
  });

  it('resolves calendar sources synchronously', () => {
    expect(ExpoCalendar.getSourcesSync()).toEqual([
      { id: 'source-1', name: 'iCloud' },
    ]);
  });

  it('lists events within a range, upgraded to the wrapper class', async () => {
    const calendar = await ExpoCalendar.getByIdAsync('calendar-1');
    const events = await calendar.listEventsAsync(
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );
    expect(events[0]).toBeInstanceOf(ExpoCalendarEvent);
  });

  it('lists reminders within a range', async () => {
    const calendar = await ExpoCalendar.getByIdAsync('calendar-1');
    const reminders = await calendar.listRemindersAsync();
    expect(reminders[0]).toBeInstanceOf(ExpoCalendarReminder);
  });

  it('creates an event, stringifying Date fields for the native bridge', async () => {
    const calendar = await ExpoCalendar.getByIdAsync('calendar-1');
    const startDate = new Date('2026-02-01T10:00:00.000Z');
    const endDate = new Date('2026-02-01T11:00:00.000Z');
    const event = await calendar.createEventAsync({
      startDate,
      endDate,
      title: 'Standup',
    });
    expect(event).toBeInstanceOf(ExpoCalendarEvent);
    const [record] = (
      calendar.createEvent as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(record.startDate).toBe(startDate.toISOString());
    expect(record.endDate).toBe(endDate.toISOString());
  });

  it('creates a reminder', async () => {
    const calendar = await ExpoCalendar.getByIdAsync('calendar-1');
    const reminder = await calendar.createReminderAsync({ title: 'Buy milk' });
    expect(reminder).toBeInstanceOf(ExpoCalendarReminder);
  });

  it('adds an event through the native form dialog', async () => {
    const calendar = await ExpoCalendar.getByIdAsync('calendar-1');
    const result = await calendar.addEventWithFormAsync({ title: 'Trip' });
    expect(result).toEqual({ action: 'saved', id: 'event-1' });
  });

  it('updates without a nullableFields array', async () => {
    const calendar = await ExpoCalendar.getByIdAsync('calendar-1');
    await calendar.updateAsync({ title: 'Renamed', color: null });
    expect(calendar.update).toHaveBeenCalledWith({ title: 'Renamed' });
  });

  it('deletes the calendar', async () => {
    const calendar = await ExpoCalendar.getByIdAsync('calendar-1');
    await calendar.deleteAsync();
    expect(calendar.delete).toHaveBeenCalled();
  });
});

describe('ExpoCalendarEvent', () => {
  it('finds an event by id', async () => {
    const event = await ExpoCalendarEvent.findByIdAsync('event-1');
    expect(event).toBeInstanceOf(ExpoCalendarEvent);
  });

  it('finds all events across calendars, stringifying dates', async () => {
    const startDate = new Date('2026-01-01');
    const endDate = new Date('2026-01-31');
    const events = await ExpoCalendarEvent.findAllAsync(
      ['calendar-1'],
      startDate,
      endDate,
    );
    expect(events[0]).toBeInstanceOf(ExpoCalendarEvent);
    expect(FAKE_MODULE.listEvents).toHaveBeenCalledWith(
      ['calendar-1'],
      startDate.toISOString(),
      endDate.toISOString(),
    );
  });

  it('creates an attendee, upgraded to the wrapper class', async () => {
    const event = await ExpoCalendarEvent.findByIdAsync('event-1');
    const attendee = await event.createAttendeeAsync({
      name: 'Alex',
      role: 'required' as never,
      status: 'accepted' as never,
      type: 'person' as never,
      email: 'alex@example.com',
    });
    expect(attendee).toBeInstanceOf(ExpoCalendarAttendee);
  });

  it('opens and edits the event in the native calendar UI', async () => {
    const event = await ExpoCalendarEvent.findByIdAsync('event-1');
    await event.openInCalendarAsync();
    await event.editInCalendarAsync();
    expect(event.openInCalendar).toHaveBeenCalled();
    expect(event.editInCalendar).toHaveBeenCalled();
  });

  it('resolves a recurring occurrence synchronously', async () => {
    const event = await ExpoCalendarEvent.findByIdAsync('event-1');
    const occurrence = event.getOccurrence({
      instanceStartDate: new Date('2026-03-01'),
    });
    expect(occurrence).toBeInstanceOf(ExpoCalendarEvent);
  });

  it('lists attendees, upgraded to the wrapper class', async () => {
    const event = await ExpoCalendarEvent.findByIdAsync('event-1');
    const attendees = await event.getAttendeesAsync();
    expect(attendees[0]).toBeInstanceOf(ExpoCalendarAttendee);
  });

  it('splits a null field into nullableFields on update', async () => {
    const event = await ExpoCalendarEvent.findByIdAsync('event-1');
    await event.updateAsync({ title: 'Renamed', location: null });
    expect(event.update).toHaveBeenCalledWith({ title: 'Renamed' }, [
      'location',
    ]);
  });

  it('deletes the event', async () => {
    const event = await ExpoCalendarEvent.findByIdAsync('event-1');
    await event.deleteAsync();
    expect(event.delete).toHaveBeenCalled();
  });
});

describe('ExpoCalendarAttendee', () => {
  it('updates with a nullableFields split', async () => {
    const event = await ExpoCalendarEvent.findByIdAsync('event-1');
    const attendee = await event.createAttendeeAsync({
      name: 'Alex',
      role: 'required' as never,
      status: 'accepted' as never,
      type: 'person' as never,
      email: 'alex@example.com',
    });
    await attendee.updateAsync({ name: 'Alexey', email: null });
    expect(attendee.update).toHaveBeenCalledWith({ name: 'Alexey' }, ['email']);
  });

  it('deletes the attendee', async () => {
    const event = await ExpoCalendarEvent.findByIdAsync('event-1');
    const attendee = await event.createAttendeeAsync({
      name: 'Alex',
      role: 'required' as never,
      status: 'accepted' as never,
      type: 'person' as never,
      email: 'alex@example.com',
    });
    await attendee.deleteAsync();
    expect(attendee.delete).toHaveBeenCalled();
  });
});

describe('ExpoCalendarReminder', () => {
  it('finds a reminder by id', async () => {
    const reminder = await ExpoCalendarReminder.findByIdAsync('reminder-1');
    expect(reminder).toBeInstanceOf(ExpoCalendarReminder);
  });

  it('updates with a nullableFields split', async () => {
    const reminder = await ExpoCalendarReminder.findByIdAsync('reminder-1');
    await reminder.updateAsync({ title: 'Renamed', location: null });
    expect(reminder.update).toHaveBeenCalledWith({ title: 'Renamed' }, [
      'location',
    ]);
  });

  it('deletes the reminder', async () => {
    const reminder = await ExpoCalendarReminder.findByIdAsync('reminder-1');
    await reminder.deleteAsync();
    expect(reminder.delete).toHaveBeenCalled();
  });
});

describe('permissions', () => {
  it('gets and requests calendar permissions', async () => {
    await getCalendarPermissionsAsync(true);
    await requestCalendarPermissionsAsync(true);
    expect(FAKE_MODULE.getCalendarPermissions).toHaveBeenCalledWith(true);
    expect(FAKE_MODULE.requestCalendarPermissions).toHaveBeenCalledWith(true);
  });

  it('gets and requests reminders permissions', async () => {
    await getRemindersPermissionsAsync();
    await requestRemindersPermissionsAsync();
    expect(FAKE_MODULE.getRemindersPermissions).toHaveBeenCalled();
    expect(FAKE_MODULE.requestRemindersPermissions).toHaveBeenCalled();
  });
});
