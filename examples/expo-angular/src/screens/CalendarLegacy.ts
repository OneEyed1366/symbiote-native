import { Component, signal } from '@angular/core';
import {
  AttendeeRole,
  AttendeeStatus,
  AttendeeType,
  EntityTypes,
  ReminderStatus,
  createAttendeeAsync,
  createCalendarAsync,
  createEventAsync,
  createEventInCalendarAsync,
  createReminderAsync,
  deleteAttendeeAsync,
  deleteCalendarAsync,
  deleteEventAsync,
  deleteReminderAsync,
  editEventInCalendarAsync,
  getAttendeesForEventAsync,
  getCalendarPermissionsAsync,
  getCalendarsAsync,
  getDefaultCalendarAsync,
  getEventAsync,
  getEventsAsync,
  getReminderAsync,
  getRemindersAsync,
  getRemindersPermissionsAsync,
  getSourceAsync,
  getSourcesAsync,
  isAvailableAsync,
  openEventInCalendar,
  openEventInCalendarAsync,
  requestCalendarPermissionsAsync,
  requestPermissionsAsync,
  requestRemindersPermissionsAsync,
  updateAttendeeAsync,
  updateCalendarAsync,
  updateEventAsync,
  updateReminderAsync,
} from '@symbiote-native/calendar/legacy';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import type { ICall } from '../components/call-console';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { DAY_MS, need } from './calendar-summaries';

const HOUR_MS = 3_600_000;

function eventData() {
  const start = new Date(Date.now() + HOUR_MS);
  return {
    title: 'Legacy canary event',
    startDate: start,
    endDate: new Date(start.getTime() + HOUR_MS),
    notes: 'Created by the legacy API',
  };
}

function optional(text: string): string | undefined {
  return text.trim() === '' ? undefined : text.trim();
}

@Component({
  selector: 'CalendarLegacy',
  standalone: true,
  imports: [CallConsole, Card, Field],
  template: `
    <Card testID="calendar-legacy-ids-card" title="Legacy ids">
      <Field
        testID="calendar-legacy-calendar-input"
        label="calendar id"
        [(value)]="calendarId"
      />
      <Field
        testID="calendar-legacy-event-input"
        label="event id"
        [(value)]="eventId"
      />
      <Field
        testID="calendar-legacy-attendee-input"
        label="attendee id"
        [(value)]="attendeeId"
      />
      <Field
        testID="calendar-legacy-reminder-input"
        label="reminder id"
        [(value)]="reminderId"
      />
      <Field
        testID="calendar-legacy-source-input"
        label="source id"
        [(value)]="sourceId"
      />
    </Card>
    <CallConsole
      prefix="calendar-legacy-calendars"
      title="Legacy calendars and sources"
      [color]="color"
      [calls]="calendarCalls"
    />
    <CallConsole
      prefix="calendar-legacy-events"
      title="Legacy events, attendees and dialogs"
      [color]="color"
      [calls]="eventCalls"
    />
    <CallConsole
      prefix="calendar-legacy-reminders"
      title="Legacy reminders and permissions"
      [color]="color"
      [calls]="reminderCalls"
    />
  `,
})
export class CalendarLegacy {
  readonly color = lineColorOf(ROUTE_NAME.Calendar);

  readonly calendarId = signal('');
  readonly eventId = signal('');
  readonly attendeeId = signal('');
  readonly reminderId = signal('');
  readonly sourceId = signal('');

  private calendar(): string {
    return need(this.calendarId(), 'calendar id');
  }

  private event(): string {
    return need(this.eventId(), 'event id');
  }

  private attendee(): string {
    return need(this.attendeeId(), 'attendee id');
  }

  private reminder(): string {
    return need(this.reminderId(), 'reminder id');
  }

  readonly calendarCalls: ICall[] = [
    { label: 'isAvailableAsync', run: () => isAvailableAsync() },
    {
      label: 'getCalendarsAsync(event)',
      run: async () => {
        const all = await getCalendarsAsync(EntityTypes.EVENT);
        this.calendarId.set(all[0]?.id ?? this.calendarId());
        return all.map(item => ({
          id: item.id,
          title: item.title,
          type: item.type,
        }));
      },
    },
    {
      label: 'getDefaultCalendarAsync',
      run: async () => {
        const fallback = await getDefaultCalendarAsync();
        this.calendarId.set(fallback.id);
        this.sourceId.set(fallback.sourceId ?? '');
        return fallback;
      },
    },
    {
      label: 'createCalendarAsync',
      run: async () => {
        const id = await createCalendarAsync({
          title: 'Legacy Calendar',
          color: '#0891b2',
          entityType: EntityTypes.EVENT,
          sourceId: optional(this.sourceId()),
          name: 'legacy',
        });
        this.calendarId.set(id);
        return id;
      },
    },
    {
      label: 'updateCalendarAsync',
      run: () =>
        updateCalendarAsync(this.calendar(), {
          title: 'Legacy Calendar (updated)',
        }),
    },
    {
      label: 'deleteCalendarAsync',
      run: () => deleteCalendarAsync(this.calendar()),
    },
    { label: 'getSourcesAsync', run: () => getSourcesAsync() },
    {
      label: 'getSourceAsync',
      run: () => getSourceAsync(need(this.sourceId(), 'source id')),
    },
  ];

  readonly eventCalls: ICall[] = [
    {
      label: 'getEventsAsync',
      run: async () => {
        const events = await getEventsAsync(
          [this.calendar()],
          new Date(Date.now() - 7 * DAY_MS),
          new Date(Date.now() + 30 * DAY_MS),
        );
        this.eventId.set(events[0]?.id ?? this.eventId());
        return events.map(item => ({ id: item.id, title: item.title }));
      },
    },
    { label: 'getEventAsync', run: () => getEventAsync(this.event()) },
    {
      label: 'createEventAsync',
      run: async () => {
        const id = await createEventAsync(this.calendar(), eventData());
        this.eventId.set(id);
        return id;
      },
    },
    {
      label: 'updateEventAsync',
      run: () =>
        updateEventAsync(this.event(), { title: 'Legacy event (updated)' }),
    },
    { label: 'deleteEventAsync', run: () => deleteEventAsync(this.event()) },
    {
      label: 'getAttendeesForEventAsync',
      run: () => getAttendeesForEventAsync(this.event()),
    },
    {
      label: 'createAttendeeAsync',
      run: async () => {
        const id = await createAttendeeAsync(this.event(), {
          name: 'Legacy Guest',
          email: 'guest@example.com',
          role: AttendeeRole.REQUIRED,
          status: AttendeeStatus.PENDING,
          type: AttendeeType.PERSON,
        });
        this.attendeeId.set(id);
        return id;
      },
    },
    {
      label: 'updateAttendeeAsync',
      run: () =>
        updateAttendeeAsync(this.attendee(), { name: 'Renamed Guest' }),
    },
    {
      label: 'deleteAttendeeAsync',
      run: () => deleteAttendeeAsync(this.attendee()),
    },
    {
      label: 'createEventInCalendarAsync',
      run: () => createEventInCalendarAsync(eventData()),
    },
    {
      label: 'openEventInCalendarAsync',
      run: () => openEventInCalendarAsync({ id: this.event() }),
    },
    {
      label: 'editEventInCalendarAsync',
      run: () => editEventInCalendarAsync({ id: this.event() }),
    },
    {
      label: 'openEventInCalendar',
      run: async () => openEventInCalendar(this.event()),
    },
  ];

  readonly reminderCalls: ICall[] = [
    {
      label: 'getRemindersAsync',
      run: async () => {
        const all = await getRemindersAsync(
          [optional(this.calendarId()) ?? null],
          ReminderStatus.INCOMPLETE,
          null,
          null,
        );
        this.reminderId.set(all[0]?.id ?? this.reminderId());
        return all.map(item => ({ id: item.id, title: item.title }));
      },
    },
    { label: 'getReminderAsync', run: () => getReminderAsync(this.reminder()) },
    {
      label: 'createReminderAsync',
      run: async () => {
        const id = await createReminderAsync(
          optional(this.calendarId()) ?? null,
          {
            title: 'Legacy reminder',
            dueDate: new Date(Date.now() + HOUR_MS),
          },
        );
        this.reminderId.set(id);
        return id;
      },
    },
    {
      label: 'updateReminderAsync',
      run: () => updateReminderAsync(this.reminder(), { completed: true }),
    },
    {
      label: 'deleteReminderAsync',
      run: () => deleteReminderAsync(this.reminder()),
    },
    {
      label: 'getCalendarPermissionsAsync',
      run: () => getCalendarPermissionsAsync(),
    },
    {
      label: 'getRemindersPermissionsAsync',
      run: () => getRemindersPermissionsAsync(),
    },
    {
      label: 'requestCalendarPermissionsAsync',
      run: () => requestCalendarPermissionsAsync(),
    },
    { label: 'requestPermissionsAsync', run: () => requestPermissionsAsync() },
    {
      label: 'requestRemindersPermissionsAsync',
      run: () => requestRemindersPermissionsAsync(),
    },
  ];
}
