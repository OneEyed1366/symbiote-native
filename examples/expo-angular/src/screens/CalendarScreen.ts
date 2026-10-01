import { Component, signal } from '@angular/core';
import {
  getDefaultCalendarSync,
  listEvents,
  requestCalendarPermissions,
} from '@symbiote-native/calendar/angular';
import { CallConsole } from '../components/CallConsole';
import { Explorer } from '../components/Explorer';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import type { ICall } from '../components/call-console';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { CalendarFormCards } from './CalendarFormCards';
import { CalendarLegacy } from './CalendarLegacy';
import { CalendarModern } from './CalendarModern';
import { CalendarPermissions } from './CalendarPermissions';
import { INITIAL_FORM } from './calendar-form';
import type { IForm } from './calendar-form';
import { DAY_MS } from './calendar-summaries';
import type { IIds } from './calendar-summaries';

const WEEK_DAYS = 7;

@Component({
  selector: 'CalendarScreen',
  standalone: true,
  imports: [
    CalendarFormCards,
    CalendarLegacy,
    CalendarModern,
    CalendarPermissions,
    CallConsole,
    Explorer,
    Scenario,
    ScreenShell,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="calendar-scroll"
      title="Calendar"
      body="Put events and reminders into the user's calendar and read what is scheduled: add a booking, show an agenda, manage attendees and recurrence. Always behind a permission prompt."
    >
      <Scenario
        testID="calendar-booking-scenario"
        title="Add a booking or a flight to the user's calendar"
        why="After a purchase or a booking, offer one tap to put it in the calendar. The system form lets the user review and save, and the app never reads their other events."
        [steps]="bookingSteps"
        expect="The form opens with the title and notes from the explorer fields. After Save the event shows up in the system Calendar app."
      >
        <CallConsole
          isBare
          prefix="calendar-booking"
          title="Add event"
          [color]="color"
          [calls]="bookingCalls"
        />
      </Scenario>
      <Scenario
        testID="calendar-agenda-scenario"
        title="Show what is coming up this week"
        why="Build an agenda, find a free slot or warn about a clash with an existing event, using the user's default calendar."
        [steps]="agendaSteps"
        expect="The output lists event ids, titles and start times for the next 7 days. An empty list means a free week."
      >
        <CallConsole
          isBare
          prefix="calendar-agenda"
          title="This week"
          [color]="color"
          [calls]="agendaCalls"
        />
      </Scenario>
      <Explorer testID="calendar-explorer" [color]="color">
        <ng-template>
          <CalendarFormCards [(form)]="form" [color]="color" />
          <CalendarPermissions />
          <CalendarModern [(ids)]="ids" [form]="form()" />
          <CalendarLegacy />
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class CalendarScreen {
  readonly route = ROUTE_NAME.Calendar;
  readonly color = lineColorOf(ROUTE_NAME.Calendar);
  readonly bookingSteps = [
    'Press Allow calendar access and accept',
    'Press Add event with system form',
    'Save or cancel in the form',
  ];
  readonly agendaSteps = [
    'Allow calendar access in the previous card',
    'Press List this week',
  ];

  readonly form = signal<IForm>({ ...INITIAL_FORM });
  readonly ids = signal<IIds>({ calendarId: '', eventId: '', reminderId: '' });

  readonly bookingCalls: ICall[] = [
    { label: 'Allow calendar access', run: () => requestCalendarPermissions() },
    {
      label: 'Add event with system form',
      run: () =>
        getDefaultCalendarSync().addEventWithForm({
          title: this.form().title,
          notes: this.form().notes,
        }),
    },
  ];

  readonly agendaCalls: ICall[] = [
    {
      label: 'List this week',
      run: async () =>
        (
          await listEvents(
            [getDefaultCalendarSync().id],
            new Date(),
            new Date(Date.now() + WEEK_DAYS * DAY_MS),
          )
        ).map(event => ({
          id: event.id,
          title: event.title,
          start: event.startDate,
        })),
    },
  ];
}
