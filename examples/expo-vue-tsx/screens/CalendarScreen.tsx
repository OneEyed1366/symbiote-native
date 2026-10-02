import { defineComponent, ref } from 'vue';
import {
  getDefaultCalendarSync,
  listEvents,
  requestCalendarPermissions,
} from '@symbiote-native/calendar/vue';
import { CallConsole } from '../components/CallConsole';
import { Explorer, Scenario } from '../components/Scenario';
import { ScreenShell, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { ChoiceFormCard, INITIAL_FORM, TextFormCard } from './calendar-form';
import type { IForm, ISetForm } from './calendar-form';
import { LegacyCards } from './calendar-legacy';
import { ModernCards } from './calendar-modern';
import type { IIds, ISetIds } from './calendar-modern';

const color = lineColorOf(ROUTE_NAME.Calendar);
const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

function CalendarScenarios(props: { form: IForm }) {
  return (
    <>
      <Scenario
        testID="calendar-booking-scenario"
        title="Add a booking or a flight to the user's calendar"
        why="After a purchase or a booking, offer one tap to put it in the calendar. The system form lets the user review and save, and the app never reads their other events."
        steps={['Press Allow calendar access and accept', 'Press Add event with system form', 'Save or cancel in the form']}
        expect="The form opens with the title and notes from the explorer fields. After Save the event shows up in the system Calendar app."
      >
        <CallConsole
          isBare
          prefix="calendar-booking"
          title="Add event"
          color={color}
          calls={[
            { label: 'Allow calendar access', run: () => requestCalendarPermissions() },
            {
              label: 'Add event with system form',
              run: () => getDefaultCalendarSync().addEventWithForm({ title: props.form.title, notes: props.form.notes }),
            },
          ]}
        />
      </Scenario>
      <Scenario
        testID="calendar-agenda-scenario"
        title="Show what is coming up this week"
        why="Build an agenda, find a free slot or warn about a clash with an existing event, using the user's default calendar."
        steps={['Allow calendar access in the previous card', 'Press List this week']}
        expect="The output lists event ids, titles and start times for the next 7 days. An empty list means a free week."
      >
        <CallConsole
          isBare
          prefix="calendar-agenda"
          title="This week"
          color={color}
          calls={[
            {
              label: 'List this week',
              run: async () =>
                (
                  await listEvents(
                    [getDefaultCalendarSync().id],
                    new Date(),
                    new Date(Date.now() + WEEK_DAYS * DAY_MS),
                  )
                ).map(event => ({ id: event.id, title: event.title, start: event.startDate })),
            },
          ]}
        />
      </Scenario>
    </>
  );
}

export const CalendarScreen = defineComponent(
  () => {
    const form = ref<IForm>(INITIAL_FORM);
    const ids = ref<IIds>({ calendarId: '', eventId: '', reminderId: '' });
    const setForm: ISetForm = patch => {
      form.value = { ...form.value, ...patch };
    };
    const setIds: ISetIds = patch => {
      ids.value = { ...ids.value, ...patch };
    };

    return () => (
      <ScreenShell
        route={ROUTE_NAME.Calendar}
        testID="calendar-scroll"
        title="Calendar"
        body="Put events and reminders into the user's calendar and read what is scheduled: add a booking, show an agenda, manage attendees and recurrence. Always behind a permission prompt."
      >
        <CalendarScenarios form={form.value} />
        <Explorer testID="calendar-explorer" color={color}>
          <TextFormCard form={form.value} setForm={setForm} />
          <ChoiceFormCard form={form.value} setForm={setForm} />
          <ModernCards ids={ids.value} setIds={setIds} form={form.value} />
          <LegacyCards />
        </Explorer>
      </ScreenShell>
    );
  },
  { name: 'CalendarScreen' },
);
