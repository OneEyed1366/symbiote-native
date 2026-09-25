import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_CALENDAR = {
  createEventInCalendarAsync: vi.fn(async () => ({
    action: 'saved',
    id: 'event-1',
  })),
  openEventInCalendarAsync: vi.fn(async () => ({ action: 'done' })),
  editEventInCalendarAsync: vi.fn(async () => ({
    action: 'done',
    id: 'event-1',
  })),
  getCalendarsAsync: vi.fn(async () => [{ id: 'calendar-1', title: 'Work' }]),
  saveCalendarAsync: vi.fn(async () => 'calendar-1'),
  deleteCalendarAsync: vi.fn(async () => undefined),
  getEventsAsync: vi.fn(async () => [{ id: 'event-1', title: 'Standup' }]),
  getEventByIdAsync: vi.fn(async () => ({ id: 'event-1', title: 'Standup' })),
  saveEventAsync: vi.fn(async () => 'event-1'),
  deleteEventAsync: vi.fn(async () => undefined),
  getAttendeesForEventAsync: vi.fn(async () => [
    { id: 'attendee-1', name: 'Jane' },
  ]),
  saveAttendeeForEventAsync: vi.fn(async () => 'attendee-1'),
  deleteAttendeeAsync: vi.fn(async () => undefined),
  getDefaultCalendarAsync: vi.fn(async () => ({
    id: 'calendar-1',
    title: 'Default',
  })),
  getRemindersAsync: vi.fn(async () => [
    { id: 'reminder-1', title: 'Buy milk' },
  ]),
  getReminderByIdAsync: vi.fn(async () => ({
    id: 'reminder-1',
    title: 'Buy milk',
  })),
  saveReminderAsync: vi.fn(async () => 'reminder-1'),
  deleteReminderAsync: vi.fn(async () => undefined),
  getSourcesAsync: vi.fn(async () => [
    { id: 'source-1', name: 'iCloud', type: 'local' },
  ]),
  getSourceByIdAsync: vi.fn(async () => ({
    id: 'source-1',
    name: 'iCloud',
    type: 'local',
  })),
  openEventInCalendar: vi.fn(),
  getCalendarPermissionsAsync: vi.fn(async () => ({
    granted: true,
    status: 'granted',
    canAskAgain: true,
    expires: 'never',
  })),
  requestCalendarPermissionsAsync: vi.fn(async () => ({
    granted: true,
    status: 'granted',
    canAskAgain: true,
    expires: 'never',
  })),
  getRemindersPermissionsAsync: vi.fn(async () => ({
    granted: true,
    status: 'granted',
    canAskAgain: true,
    expires: 'never',
  })),
  requestRemindersPermissionsAsync: vi.fn(async () => ({
    granted: true,
    status: 'granted',
    canAskAgain: true,
    expires: 'never',
  })),
};

vi.mock('./native-module', () => ({ expoCalendar: FAKE_NATIVE_CALENDAR }));

vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  isAvailableAsync,
  getCalendarsAsync,
  createCalendarAsync,
  updateCalendarAsync,
  deleteCalendarAsync,
  getEventsAsync,
  getEventAsync,
  createEventAsync,
  updateEventAsync,
  deleteEventAsync,
  getAttendeesForEventAsync,
  createAttendeeAsync,
  updateAttendeeAsync,
  deleteAttendeeAsync,
  getDefaultCalendarAsync,
  getRemindersAsync,
  getReminderAsync,
  createReminderAsync,
  updateReminderAsync,
  deleteReminderAsync,
  getSourcesAsync,
  getSourceAsync,
  openEventInCalendar,
  getCalendarPermissionsAsync,
  requestCalendarPermissionsAsync,
  getRemindersPermissionsAsync,
  requestRemindersPermissionsAsync,
} = await import('./calendar');

afterEach(() => {
  vi.clearAllMocks();
});

describe('calendars', () => {
  it('reports availability from the presence of getCalendarsAsync', async () => {
    expect(await isAvailableAsync()).toBe(true);
  });

  it('lists calendars, defaulting entityType to null', async () => {
    await getCalendarsAsync();
    expect(FAKE_NATIVE_CALENDAR.getCalendarsAsync).toHaveBeenCalledWith(null);
  });

  it('creates a calendar, stripping any client-supplied id', async () => {
    await createCalendarAsync({ title: 'Work' });
    expect(FAKE_NATIVE_CALENDAR.saveCalendarAsync).toHaveBeenCalledWith({
      title: 'Work',
      id: undefined,
    });
  });

  it('rejects updateCalendarAsync without an id', async () => {
    await expect(updateCalendarAsync('')).rejects.toThrow(/id/);
  });

  it('updates a calendar by id', async () => {
    await updateCalendarAsync('calendar-1', { title: 'Renamed' });
    expect(FAKE_NATIVE_CALENDAR.saveCalendarAsync).toHaveBeenCalledWith({
      title: 'Renamed',
      id: 'calendar-1',
    });
  });

  it('deletes a calendar by id', async () => {
    await deleteCalendarAsync('calendar-1');
    expect(FAKE_NATIVE_CALENDAR.deleteCalendarAsync).toHaveBeenCalledWith(
      'calendar-1',
    );
  });
});

describe('events', () => {
  it('rejects getEventsAsync without a startDate, endDate, or calendarIds', async () => {
    const startDate = new Date('2026-01-01');
    const endDate = new Date('2026-01-31');
    await expect(getEventsAsync([], startDate, endDate)).rejects.toThrow(
      /calendarIds/,
    );
  });

  it('lists events across calendars, stringifying dates', async () => {
    const startDate = new Date('2026-01-01');
    const endDate = new Date('2026-01-31');
    await getEventsAsync(['calendar-1'], startDate, endDate);
    expect(FAKE_NATIVE_CALENDAR.getEventsAsync).toHaveBeenCalledWith(
      startDate.toISOString(),
      endDate.toISOString(),
      ['calendar-1'],
    );
  });

  it('passes instanceStartDate for recurring event lookups on iOS', async () => {
    const instanceStartDate = new Date('2026-01-15');
    await getEventAsync('event-1', { instanceStartDate });
    expect(FAKE_NATIVE_CALENDAR.getEventByIdAsync).toHaveBeenCalledWith(
      'event-1',
      instanceStartDate,
    );
  });

  it('rejects createEventAsync without a calendarId', async () => {
    await expect(createEventAsync('')).rejects.toThrow(/calendarId|id/);
  });

  it('creates an event under a calendar', async () => {
    const startDate = new Date('2026-02-01');
    const endDate = new Date('2026-02-01T01:00:00.000Z');
    await createEventAsync('calendar-1', {
      title: 'Standup',
      startDate,
      endDate,
    });
    expect(FAKE_NATIVE_CALENDAR.saveEventAsync).toHaveBeenCalledWith(
      {
        title: 'Standup',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        calendarId: 'calendar-1',
      },
      {},
    );
  });

  it('updates an event, threading futureEvents/instanceStartDate through recurringEventOptions', async () => {
    await updateEventAsync(
      'event-1',
      { title: 'Renamed' },
      { futureEvents: true },
    );
    expect(FAKE_NATIVE_CALENDAR.saveEventAsync).toHaveBeenCalledWith(
      { title: 'Renamed', id: 'event-1', instanceStartDate: undefined },
      { futureEvents: true },
    );
  });

  it('deletes an event, defaulting futureEvents to false', async () => {
    await deleteEventAsync('event-1');
    expect(FAKE_NATIVE_CALENDAR.deleteEventAsync).toHaveBeenCalledWith(
      { id: 'event-1', instanceStartDate: undefined },
      { futureEvents: false },
    );
  });
});

describe('attendees', () => {
  it('lists attendees for an event', async () => {
    const attendees = await getAttendeesForEventAsync('event-1');
    expect(attendees).toHaveLength(1);
  });

  it('rejects createAttendeeAsync missing required fields', async () => {
    await expect(
      createAttendeeAsync('event-1', { email: 'jane@example.com' }),
    ).rejects.toThrow(/role/);
  });

  it('creates an attendee with all required fields', async () => {
    await createAttendeeAsync('event-1', {
      email: 'jane@example.com',
      role: 'required' as never,
      type: 'person' as never,
      status: 'accepted' as never,
    });
    expect(FAKE_NATIVE_CALENDAR.saveAttendeeForEventAsync).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jane@example.com' }),
      'event-1',
    );
  });

  it('updates and deletes an attendee', async () => {
    await updateAttendeeAsync('attendee-1', { name: 'Jane Doe' });
    await deleteAttendeeAsync('attendee-1');
    expect(FAKE_NATIVE_CALENDAR.saveAttendeeForEventAsync).toHaveBeenCalledWith(
      { name: 'Jane Doe', id: 'attendee-1' },
      null,
    );
    expect(FAKE_NATIVE_CALENDAR.deleteAttendeeAsync).toHaveBeenCalledWith(
      'attendee-1',
    );
  });
});

describe('default calendar, reminders, sources', () => {
  it('resolves the default calendar', async () => {
    const calendar = await getDefaultCalendarAsync();
    expect(calendar.id).toBe('calendar-1');
  });

  it('rejects getRemindersAsync without calendarIds', async () => {
    await expect(getRemindersAsync([], null, null, null)).rejects.toThrow(
      /calendarIds/,
    );
  });

  it('lists reminders', async () => {
    await getRemindersAsync(['calendar-1'], null, null, null);
    expect(FAKE_NATIVE_CALENDAR.getRemindersAsync).toHaveBeenCalledWith(
      null,
      null,
      ['calendar-1'],
      null,
    );
  });

  it('gets, creates, updates, and deletes a reminder', async () => {
    await getReminderAsync('reminder-1');
    await createReminderAsync('calendar-1', { title: 'Buy milk' });
    await updateReminderAsync('reminder-1', { title: 'Buy oat milk' });
    await deleteReminderAsync('reminder-1');
    expect(FAKE_NATIVE_CALENDAR.saveReminderAsync).toHaveBeenNthCalledWith(1, {
      title: 'Buy milk',
      calendarId: 'calendar-1',
    });
    expect(FAKE_NATIVE_CALENDAR.deleteReminderAsync).toHaveBeenCalledWith(
      'reminder-1',
    );
  });

  it('lists sources and resolves one by id', async () => {
    const sources = await getSourcesAsync();
    expect(sources).toHaveLength(1);
    const source = await getSourceAsync('source-1');
    expect(source.id).toBe('source-1');
  });

  it('opens an event in the native calendar app (Android)', () => {
    openEventInCalendar('event-1');
    expect(FAKE_NATIVE_CALENDAR.openEventInCalendar).toHaveBeenCalledWith(
      'event-1',
    );
  });
});

describe('permissions', () => {
  it('gets and requests calendar and reminders permissions', async () => {
    await getCalendarPermissionsAsync();
    await requestCalendarPermissionsAsync();
    await getRemindersPermissionsAsync();
    await requestRemindersPermissionsAsync();
    expect(FAKE_NATIVE_CALENDAR.getCalendarPermissionsAsync).toHaveBeenCalled();
    expect(
      FAKE_NATIVE_CALENDAR.requestCalendarPermissionsAsync,
    ).toHaveBeenCalled();
    expect(
      FAKE_NATIVE_CALENDAR.getRemindersPermissionsAsync,
    ).toHaveBeenCalled();
    expect(
      FAKE_NATIVE_CALENDAR.requestRemindersPermissionsAsync,
    ).toHaveBeenCalled();
  });
});
