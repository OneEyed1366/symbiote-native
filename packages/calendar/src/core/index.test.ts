import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fakes use real prototype methods, not `x = vi.fn(...)` class fields - a field is an own
// property that shadows a subclass `override` on direct calls (only `super.x()` would see it).
// Each method is wrapped with `vi.spyOn` after the class body instead.

class FakeNativeExpoCalendarAttendee {
  id = 'attendee-1';
  name?: string;
  email?: string;
  deleted = false;

  constructor(record: Record<string, unknown> = {}) {
    Object.assign(this, record);
  }

  async update(
    patch: Record<string, unknown>,
    _nullableFields: string[],
  ): Promise<void> {
    Object.assign(this, patch);
  }

  async delete(): Promise<void> {
    this.deleted = true;
  }
}
vi.spyOn(FakeNativeExpoCalendarAttendee.prototype, 'update');
vi.spyOn(FakeNativeExpoCalendarAttendee.prototype, 'delete');

class FakeNativeExpoCalendarReminder {
  id: string;
  title?: string;
  completed = false;
  deleted = false;

  constructor(id = 'reminder-1') {
    this.id = id;
  }

  async update(
    patch: Record<string, unknown>,
    _nullableFields: string[],
  ): Promise<void> {
    Object.assign(this, patch);
  }

  async delete(): Promise<void> {
    this.deleted = true;
  }
}
vi.spyOn(FakeNativeExpoCalendarReminder.prototype, 'update');
vi.spyOn(FakeNativeExpoCalendarReminder.prototype, 'delete');

class FakeNativeExpoCalendarEvent {
  id: string;
  calendarId?: string;
  title?: string;
  deleted = false;

  constructor(record: Record<string, unknown> = {}) {
    this.id = 'event-1';
    Object.assign(this, record);
  }

  async createAttendee(
    record: Record<string, unknown>,
  ): Promise<FakeNativeExpoCalendarAttendee> {
    return new FakeNativeExpoCalendarAttendee(record);
  }

  async openInCalendar(): Promise<{ action: string; id: string }> {
    return { action: 'opened', id: this.id };
  }

  async editInCalendar(): Promise<{ action: string; id: string }> {
    return { action: 'edited', id: this.id };
  }

  getOccurrenceSync(options?: {
    instanceStartDate?: string;
  }): FakeNativeExpoCalendarEvent {
    return new FakeNativeExpoCalendarEvent({
      ...this,
      startDate: options?.instanceStartDate ?? this.id,
    });
  }

  async getAttendees(): Promise<FakeNativeExpoCalendarAttendee[]> {
    return [new FakeNativeExpoCalendarAttendee({ id: 'attendee-1' })];
  }

  async update(
    patch: Record<string, unknown>,
    _nullableFields: string[],
  ): Promise<void> {
    Object.assign(this, patch);
  }

  async delete(): Promise<void> {
    this.deleted = true;
  }
}
vi.spyOn(FakeNativeExpoCalendarEvent.prototype, 'createAttendee');
vi.spyOn(FakeNativeExpoCalendarEvent.prototype, 'openInCalendar');
vi.spyOn(FakeNativeExpoCalendarEvent.prototype, 'editInCalendar');
vi.spyOn(FakeNativeExpoCalendarEvent.prototype, 'getOccurrenceSync');
vi.spyOn(FakeNativeExpoCalendarEvent.prototype, 'getAttendees');
vi.spyOn(FakeNativeExpoCalendarEvent.prototype, 'update');
vi.spyOn(FakeNativeExpoCalendarEvent.prototype, 'delete');

class FakeNativeExpoCalendar {
  id: string;
  title?: string;
  deleted = false;

  constructor(record: Record<string, unknown> = {}) {
    this.id = 'calendar-1';
    Object.assign(this, record);
  }

  async listEvents(
    startDate: string,
    endDate: string,
  ): Promise<FakeNativeExpoCalendarEvent[]> {
    return [
      new FakeNativeExpoCalendarEvent({
        id: 'event-1',
        calendarId: this.id,
        startDate,
        endDate,
      }),
    ];
  }

  async listReminders(): Promise<FakeNativeExpoCalendarReminder[]> {
    return [new FakeNativeExpoCalendarReminder('reminder-1')];
  }

  async createEvent(
    record: Record<string, unknown>,
  ): Promise<FakeNativeExpoCalendarEvent> {
    return new FakeNativeExpoCalendarEvent({ calendarId: this.id, ...record });
  }

  async createReminder(
    _record: Record<string, unknown>,
  ): Promise<FakeNativeExpoCalendarReminder> {
    return new FakeNativeExpoCalendarReminder('reminder-1');
  }

  async addEventWithForm(): Promise<{ action: string; id: string }> {
    return { action: 'saved', id: 'event-1' };
  }

  async update(patch: Record<string, unknown>): Promise<void> {
    Object.assign(this, patch);
  }

  async delete(): Promise<void> {
    this.deleted = true;
  }
}
vi.spyOn(FakeNativeExpoCalendar.prototype, 'listEvents');
vi.spyOn(FakeNativeExpoCalendar.prototype, 'listReminders');
vi.spyOn(FakeNativeExpoCalendar.prototype, 'createEvent');
vi.spyOn(FakeNativeExpoCalendar.prototype, 'createReminder');
vi.spyOn(FakeNativeExpoCalendar.prototype, 'addEventWithForm');
vi.spyOn(FakeNativeExpoCalendar.prototype, 'update');
vi.spyOn(FakeNativeExpoCalendar.prototype, 'delete');

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
  Platform: { OS: 'ios' },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  ExpoCalendar,
  getDefaultCalendarSync,
  getCalendars,
  createCalendar,
  presentPicker,
  listEvents,
  requestCalendarPermissions,
  getCalendarPermissions,
  requestRemindersPermissions,
  getRemindersPermissions,
  getSourcesSync,
} = await import('./calendar');
const { ExpoCalendarEvent } = await import('./event');
const { ExpoCalendarAttendee } = await import('./attendee');
const { ExpoCalendarReminder } = await import('./reminder');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('module-level calendar functions', () => {
  it('lists all calendars, upgraded to the wrapper class', async () => {
    const calendars = await getCalendars();
    expect(calendars[0]).toBeInstanceOf(ExpoCalendar);
    expect(FAKE_MODULE.getCalendars).toHaveBeenCalledWith(null);
  });

  it('filters by entity type when provided', async () => {
    await getCalendars('event' as never);
    expect(FAKE_MODULE.getCalendars).toHaveBeenCalledWith('event');
  });

  it('creates a calendar from input', async () => {
    const calendar = await createCalendar({ title: 'Work' });
    expect(calendar).toBeInstanceOf(ExpoCalendar);
    expect(FAKE_MODULE.createCalendar).toHaveBeenCalledWith({ title: 'Work' });
  });

  it('resolves the default calendar synchronously', () => {
    const calendar = getDefaultCalendarSync();
    expect(calendar).toBeInstanceOf(ExpoCalendar);
    expect(calendar.id).toBe('default-calendar');
  });

  it('presents the native calendar picker', async () => {
    const calendar = await presentPicker();
    expect(calendar).toBeInstanceOf(ExpoCalendar);
  });

  it('resolves calendar sources synchronously', () => {
    expect(getSourcesSync()).toEqual([{ id: 'source-1', name: 'iCloud' }]);
  });

  it('searches events across several calendars by id or instance', async () => {
    const calendar = await ExpoCalendar.get('calendar-1');
    const events = await listEvents(
      ['calendar-2', calendar],
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );
    expect(events[0]).toBeInstanceOf(ExpoCalendarEvent);
    expect(FAKE_MODULE.listEvents).toHaveBeenCalledWith(
      ['calendar-2', 'calendar-1'],
      '2026-01-01T00:00:00.000Z',
      '2026-01-31T00:00:00.000Z',
    );
  });

  it('gets and requests calendar permissions', async () => {
    await getCalendarPermissions(true);
    await requestCalendarPermissions(true);
    expect(FAKE_MODULE.getCalendarPermissions).toHaveBeenCalledWith(true);
    expect(FAKE_MODULE.requestCalendarPermissions).toHaveBeenCalledWith(true);
  });

  it('gets and requests reminders permissions', async () => {
    await getRemindersPermissions();
    await requestRemindersPermissions();
    expect(FAKE_MODULE.getRemindersPermissions).toHaveBeenCalled();
    expect(FAKE_MODULE.requestRemindersPermissions).toHaveBeenCalled();
  });
});

describe('ExpoCalendar', () => {
  it('finds a calendar by id', async () => {
    const calendar = await ExpoCalendar.get('calendar-1');
    expect(calendar).toBeInstanceOf(ExpoCalendar);
    expect(calendar.id).toBe('calendar-1');
  });

  it('lists events within a range, upgraded to the wrapper class', async () => {
    const calendar = await ExpoCalendar.get('calendar-1');
    const events = await calendar.listEvents(
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );
    expect(events[0]).toBeInstanceOf(ExpoCalendarEvent);
  });

  it('lists reminders within a range', async () => {
    const calendar = await ExpoCalendar.get('calendar-1');
    const reminders = await calendar.listReminders();
    expect(reminders[0]).toBeInstanceOf(ExpoCalendarReminder);
  });

  it('creates an event, stringifying Date fields for the native bridge', async () => {
    const calendar = await ExpoCalendar.get('calendar-1');
    const startDate = new Date('2026-02-01T10:00:00.000Z');
    const endDate = new Date('2026-02-01T11:00:00.000Z');
    const event = await calendar.createEvent({
      startDate,
      endDate,
      title: 'Standup',
    });
    expect(event).toBeInstanceOf(ExpoCalendarEvent);
    const [record] = vi.mocked(FakeNativeExpoCalendar.prototype.createEvent)
      .mock.calls[0];
    expect(record.startDate).toBe(startDate.toISOString());
    expect(record.endDate).toBe(endDate.toISOString());
  });

  it('creates a reminder', async () => {
    const calendar = await ExpoCalendar.get('calendar-1');
    const reminder = await calendar.createReminder({ title: 'Buy milk' });
    expect(reminder).toBeInstanceOf(ExpoCalendarReminder);
  });

  it('adds an event through the native form dialog', async () => {
    const calendar = await ExpoCalendar.get('calendar-1');
    const result = await calendar.addEventWithForm({ title: 'Trip' });
    expect(result).toEqual({ action: 'saved', id: 'event-1' });
  });

  it('updates, keeping a null field in the record', async () => {
    const calendar = await ExpoCalendar.get('calendar-1');
    await calendar.update({ title: 'Renamed', color: null });
    expect(FakeNativeExpoCalendar.prototype.update).toHaveBeenCalledWith({
      title: 'Renamed',
      color: null,
    });
  });

  it('deletes the calendar', async () => {
    const calendar = await ExpoCalendar.get('calendar-1');
    await calendar.delete();
    expect(FakeNativeExpoCalendar.prototype.delete).toHaveBeenCalled();
  });
});

describe('ExpoCalendarEvent', () => {
  it('finds an event by id', async () => {
    const event = await ExpoCalendarEvent.get('event-1');
    expect(event).toBeInstanceOf(ExpoCalendarEvent);
  });

  it('creates an attendee, upgraded to the wrapper class', async () => {
    const event = await ExpoCalendarEvent.get('event-1');
    const attendee = await event.createAttendee({
      name: 'Alex',
      role: 'required' as never,
      status: 'accepted' as never,
      type: 'person' as never,
      email: 'alex@example.com',
    });
    expect(attendee).toBeInstanceOf(ExpoCalendarAttendee);
  });

  it('opens and edits the event in the native calendar UI', async () => {
    const event = await ExpoCalendarEvent.get('event-1');
    await event.openInCalendar();
    await event.editInCalendar();
    expect(event.openInCalendar).toHaveBeenCalled();
    expect(event.editInCalendar).toHaveBeenCalled();
  });

  it('resolves a recurring occurrence synchronously', async () => {
    const event = await ExpoCalendarEvent.get('event-1');
    const occurrence = event.getOccurrenceSync({
      instanceStartDate: new Date('2026-03-01'),
    });
    expect(occurrence).toBeInstanceOf(ExpoCalendarEvent);
  });

  it('lists attendees, upgraded to the wrapper class', async () => {
    const event = await ExpoCalendarEvent.get('event-1');
    const attendees = await event.getAttendees();
    expect(attendees[0]).toBeInstanceOf(ExpoCalendarAttendee);
  });

  it('keeps a null field in the record and lists it as nullable', async () => {
    const event = await ExpoCalendarEvent.get('event-1');
    await event.update({ title: 'Renamed', location: null });
    expect(FakeNativeExpoCalendarEvent.prototype.update).toHaveBeenCalledWith(
      { title: 'Renamed', location: null },
      ['location'],
    );
  });

  it('deletes the event', async () => {
    const event = await ExpoCalendarEvent.get('event-1');
    await event.delete();
    expect(FakeNativeExpoCalendarEvent.prototype.delete).toHaveBeenCalled();
  });
});

describe('ExpoCalendarAttendee', () => {
  it('updates with a nullableFields list', async () => {
    const event = await ExpoCalendarEvent.get('event-1');
    const attendee = await event.createAttendee({
      name: 'Alex',
      role: 'required' as never,
      status: 'accepted' as never,
      type: 'person' as never,
      email: 'alex@example.com',
    });
    await attendee.update({ name: 'Alexey', email: null });
    expect(
      FakeNativeExpoCalendarAttendee.prototype.update,
    ).toHaveBeenCalledWith({ name: 'Alexey', email: null }, ['email']);
  });

  it('deletes the attendee', async () => {
    const event = await ExpoCalendarEvent.get('event-1');
    const attendee = await event.createAttendee({
      name: 'Alex',
      role: 'required' as never,
      status: 'accepted' as never,
      type: 'person' as never,
      email: 'alex@example.com',
    });
    await attendee.delete();
    expect(FakeNativeExpoCalendarAttendee.prototype.delete).toHaveBeenCalled();
  });
});

describe('ExpoCalendarReminder', () => {
  it('finds a reminder by id', async () => {
    const reminder = await ExpoCalendarReminder.get('reminder-1');
    expect(reminder).toBeInstanceOf(ExpoCalendarReminder);
  });

  it('updates with a nullableFields list', async () => {
    const reminder = await ExpoCalendarReminder.get('reminder-1');
    await reminder.update({ title: 'Renamed', location: null });
    expect(
      FakeNativeExpoCalendarReminder.prototype.update,
    ).toHaveBeenCalledWith({ title: 'Renamed', location: null }, ['location']);
  });

  it('deletes the reminder', async () => {
    const reminder = await ExpoCalendarReminder.get('reminder-1');
    await reminder.delete();
    expect(FakeNativeExpoCalendarReminder.prototype.delete).toHaveBeenCalled();
  });
});
