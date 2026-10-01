import { Component, input, model } from '@angular/core';
import {
  AttendeeRole,
  AttendeeStatus,
  AttendeeType,
  CalendarAccessLevel,
  EntityTypes,
  ExpoCalendar,
  ExpoCalendarAttendee,
  ExpoCalendarEvent,
  ExpoCalendarReminder,
  ReminderStatus,
  createCalendar,
  getCalendars,
  getDefaultCalendarSync,
  getSourcesSync,
  listEvents,
  presentPicker,
} from '@symbiote-native/calendar/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import type { ICall } from '../components/call-console';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { toEventInput, toReminderInput } from './calendar-form';
import type { IForm } from './calendar-form';
import {
  DAY_MS,
  calendarSummary,
  eventSummary,
  need,
  reminderSummary,
} from './calendar-summaries';
import type { IIds } from './calendar-summaries';

const WEEK_BACK = new Date(Date.now() - 7 * DAY_MS);

@Component({
  selector: 'CalendarModern',
  standalone: true,
  imports: [CallConsole, Card, Field],
  template: `
    <Card testID="calendar-ids-card" title="Selected ids">
      <Field
        testID="calendar-id-input"
        label="calendar id"
        [value]="ids().calendarId"
        (valueChange)="patch({ calendarId: $event })"
      />
      <Field
        testID="calendar-event-id-input"
        label="event id"
        [value]="ids().eventId"
        (valueChange)="patch({ eventId: $event })"
      />
      <Field
        testID="calendar-reminder-id-input"
        label="reminder id"
        [value]="ids().reminderId"
        (valueChange)="patch({ reminderId: $event })"
      />
    </Card>
    <CallConsole
      prefix="calendar-top"
      title="Module functions"
      [color]="color"
      [calls]="topCalls"
    />
    <CallConsole
      prefix="calendar-instance"
      title="ExpoCalendar"
      [color]="color"
      [calls]="instanceCalls"
    />
    <CallConsole
      prefix="calendar-event"
      title="ExpoCalendarEvent"
      [color]="color"
      [calls]="eventCalls"
    />
    <CallConsole
      prefix="calendar-attendee-reminder"
      title="ExpoCalendarAttendee and ExpoCalendarReminder"
      [color]="color"
      [calls]="attendeeReminderCalls"
    />
  `,
})
export class CalendarModern {
  readonly ids = model.required<IIds>();
  readonly form = input.required<IForm>();

  readonly color = lineColorOf(ROUTE_NAME.Calendar);

  patch(change: Partial<IIds>): void {
    this.ids.update(current => ({ ...current, ...change }));
  }

  private calendar(): Promise<ExpoCalendar> {
    return ExpoCalendar.get(need(this.ids().calendarId, 'calendar id'));
  }

  private event(): Promise<ExpoCalendarEvent> {
    return ExpoCalendarEvent.get(need(this.ids().eventId, 'event id'));
  }

  private reminder(): Promise<ExpoCalendarReminder> {
    return ExpoCalendarReminder.get(need(this.ids().reminderId, 'reminder id'));
  }

  private async firstAttendee(): Promise<ExpoCalendarAttendee> {
    const [attendee] = await (await this.event()).getAttendees();
    if (attendee === undefined) {
      throw new Error(
        'the event has no attendees, use createAttendee (Android) first',
      );
    }
    return attendee;
  }

  readonly topCalls: ICall[] = [
    {
      label: 'getCalendars(event)',
      run: async () => {
        const all = await getCalendars(EntityTypes.EVENT);
        this.patch({ calendarId: all[0]?.id ?? this.ids().calendarId });
        return all.map(calendarSummary);
      },
    },
    {
      label: 'getCalendars(reminder)',
      run: async () =>
        (await getCalendars(EntityTypes.REMINDER)).map(calendarSummary),
    },
    {
      label: 'getDefaultCalendarSync',
      run: async () => calendarSummary(getDefaultCalendarSync()),
    },
    { label: 'getSourcesSync', run: async () => getSourcesSync() },
    {
      label: 'createCalendar',
      run: async () => {
        const created = await createCalendar({
          title: 'Symbiote Calendar',
          name: 'symbiote',
          color: '#0891b2',
          source: getDefaultCalendarSync().source,
          ownerAccount: 'personal',
          accessLevel: CalendarAccessLevel.OWNER,
        });
        this.patch({ calendarId: created.id });
        return calendarSummary(created);
      },
    },
    {
      label: 'presentPicker',
      run: async () => {
        const picked = await presentPicker();
        this.patch({ calendarId: picked?.id ?? this.ids().calendarId });
        return picked && calendarSummary(picked);
      },
    },
    {
      label: 'listEvents(next 30 days)',
      run: async () =>
        (
          await listEvents(
            [need(this.ids().calendarId, 'calendar id')],
            WEEK_BACK,
            new Date(Date.now() + 30 * DAY_MS),
          )
        ).map(eventSummary),
    },
  ];

  readonly instanceCalls: ICall[] = [
    {
      label: 'ExpoCalendar.get',
      run: async () => calendarSummary(await this.calendar()),
    },
    {
      label: 'listEvents (this calendar)',
      run: async () =>
        (
          await (
            await this.calendar()
          ).listEvents(WEEK_BACK, new Date(Date.now() + 30 * DAY_MS))
        ).map(eventSummary),
    },
    {
      label: 'listReminders',
      run: async () =>
        (
          await (
            await this.calendar()
          ).listReminders(null, null, ReminderStatus.INCOMPLETE)
        ).map(reminderSummary),
    },
    {
      label: 'createEvent',
      run: async () => {
        const created = await (
          await this.calendar()
        ).createEvent(toEventInput(this.form()));
        this.patch({ eventId: created.id });
        return eventSummary(created);
      },
    },
    {
      label: 'createReminder',
      run: async () => {
        const created = await (
          await this.calendar()
        ).createReminder(toReminderInput(this.form()));
        this.patch({ reminderId: created.id ?? '' });
        return reminderSummary(created);
      },
    },
    {
      label: 'addEventWithForm',
      run: async () =>
        (await this.calendar()).addEventWithForm({
          title: this.form().title,
          notes: this.form().notes,
        }),
    },
    {
      label: 'update (calendar)',
      run: async () =>
        (await this.calendar()).update({
          title: `${this.form().title} calendar`,
        }),
    },
    {
      label: 'delete (calendar)',
      run: async () => (await this.calendar()).delete(),
    },
  ];

  readonly eventCalls: ICall[] = [
    {
      label: 'ExpoCalendarEvent.get',
      run: async () => eventSummary(await this.event()),
    },
    {
      label: 'getOccurrenceSync',
      run: async () =>
        eventSummary(
          (await this.event()).getOccurrenceSync({ futureEvents: true }),
        ),
    },
    {
      label: 'getAttendees',
      run: async () =>
        (await (await this.event()).getAttendees()).map(item => ({
          id: item.id,
          name: item.name,
          email: item.email,
          status: item.status,
        })),
    },
    {
      label: 'createAttendee (Android)',
      run: async () =>
        (await this.event()).createAttendee({
          name: 'Demo Guest',
          email: 'guest@example.com',
          role: AttendeeRole.REQUIRED,
          status: AttendeeStatus.PENDING,
          type: AttendeeType.PERSON,
        }),
    },
    {
      label: 'openInCalendar',
      run: async () =>
        (await this.event()).openInCalendar({ allowsEditing: true }),
    },
    {
      label: 'editInCalendar',
      run: async () => (await this.event()).editInCalendar(),
    },
    {
      label: 'update (event)',
      run: async () =>
        (await this.event()).update({
          title: `${this.form().title} (updated)`,
          location: null,
        }),
    },
    { label: 'delete (event)', run: async () => (await this.event()).delete() },
  ];

  readonly attendeeReminderCalls: ICall[] = [
    {
      label: 'update (attendee, first)',
      run: async () =>
        (await this.firstAttendee()).update({ name: 'Renamed Guest' }),
    },
    {
      label: 'delete (attendee, first)',
      run: async () => (await this.firstAttendee()).delete(),
    },
    {
      label: 'ExpoCalendarReminder.get',
      run: async () => reminderSummary(await this.reminder()),
    },
    {
      label: 'update (reminder)',
      run: async () =>
        (await this.reminder()).update({
          title: `${this.form().title} (updated)`,
          completed: true,
        }),
    },
    {
      label: 'delete (reminder)',
      run: async () => (await this.reminder()).delete(),
    },
  ];
}
