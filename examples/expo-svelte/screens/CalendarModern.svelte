<script lang="ts">
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
  } from '@symbiote-native/calendar/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import Field from '../components/Field.svelte';
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
  import type { IIds, ISetIds } from './calendar-summaries';

  let { ids, setIds, form }: { ids: IIds; setIds: ISetIds; form: IForm } = $props();

  const color = lineColorOf(ROUTE_NAME.Calendar);
  const WEEK_BACK = new Date(Date.now() - 7 * DAY_MS);

  const calendar = () => ExpoCalendar.get(need(ids.calendarId, 'calendar id'));
  const event = () => ExpoCalendarEvent.get(need(ids.eventId, 'event id'));
  const reminder = () => ExpoCalendarReminder.get(need(ids.reminderId, 'reminder id'));

  async function firstAttendee(): Promise<ExpoCalendarAttendee> {
    const [attendee] = await (await event()).getAttendees();
    if (attendee === undefined) {
      throw new Error('the event has no attendees, use createAttendee (Android) first');
    }
    return attendee;
  }
</script>

<Card testID="calendar-ids-card" title="Selected ids">
  <Field testID="calendar-id-input" label="calendar id" value={ids.calendarId} onChange={calendarId => setIds({ calendarId })} />
  <Field testID="calendar-event-id-input" label="event id" value={ids.eventId} onChange={eventId => setIds({ eventId })} />
  <Field testID="calendar-reminder-id-input" label="reminder id" value={ids.reminderId} onChange={reminderId => setIds({ reminderId })} />
</Card>
<CallConsole
  prefix="calendar-top"
  title="Module functions"
  {color}
  calls={[
    {
      label: 'getCalendars(event)',
      run: async () => {
        const all = await getCalendars(EntityTypes.EVENT);
        setIds({ calendarId: all[0]?.id ?? ids.calendarId });
        return all.map(calendarSummary);
      },
    },
    {
      label: 'getCalendars(reminder)',
      run: async () => (await getCalendars(EntityTypes.REMINDER)).map(calendarSummary),
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
        setIds({ calendarId: created.id });
        return calendarSummary(created);
      },
    },
    {
      label: 'presentPicker',
      run: async () => {
        const picked = await presentPicker();
        setIds({ calendarId: picked?.id ?? ids.calendarId });
        return picked && calendarSummary(picked);
      },
    },
    {
      label: 'listEvents(next 30 days)',
      run: async () =>
        (
          await listEvents(
            [need(ids.calendarId, 'calendar id')],
            WEEK_BACK,
            new Date(Date.now() + 30 * DAY_MS),
          )
        ).map(eventSummary),
    },
  ]}
/>
<CallConsole
  prefix="calendar-instance"
  title="ExpoCalendar"
  {color}
  calls={[
    { label: 'ExpoCalendar.get', run: async () => calendarSummary(await calendar()) },
    {
      label: 'listEvents (this calendar)',
      run: async () =>
        (
          await (await calendar()).listEvents(WEEK_BACK, new Date(Date.now() + 30 * DAY_MS))
        ).map(eventSummary),
    },
    {
      label: 'listReminders',
      run: async () =>
        (await (await calendar()).listReminders(null, null, ReminderStatus.INCOMPLETE)).map(
          reminderSummary,
        ),
    },
    {
      label: 'createEvent',
      run: async () => {
        const created = await (await calendar()).createEvent(toEventInput(form));
        setIds({ eventId: created.id });
        return eventSummary(created);
      },
    },
    {
      label: 'createReminder',
      run: async () => {
        const created = await (await calendar()).createReminder(toReminderInput(form));
        setIds({ reminderId: created.id ?? '' });
        return reminderSummary(created);
      },
    },
    {
      label: 'addEventWithForm',
      run: async () =>
        (await calendar()).addEventWithForm({ title: form.title, notes: form.notes }),
    },
    {
      label: 'update (calendar)',
      run: async () => (await calendar()).update({ title: `${form.title} calendar` }),
    },
    { label: 'delete (calendar)', run: async () => (await calendar()).delete() },
  ]}
/>
<CallConsole
  prefix="calendar-event"
  title="ExpoCalendarEvent"
  {color}
  calls={[
    { label: 'ExpoCalendarEvent.get', run: async () => eventSummary(await event()) },
    {
      label: 'getOccurrenceSync',
      run: async () => eventSummary((await event()).getOccurrenceSync({ futureEvents: true })),
    },
    {
      label: 'getAttendees',
      run: async () =>
        (await (await event()).getAttendees()).map(item => ({
          id: item.id,
          name: item.name,
          email: item.email,
          status: item.status,
        })),
    },
    {
      label: 'createAttendee (Android)',
      run: async () =>
        (await event()).createAttendee({
          name: 'Demo Guest',
          email: 'guest@example.com',
          role: AttendeeRole.REQUIRED,
          status: AttendeeStatus.PENDING,
          type: AttendeeType.PERSON,
        }),
    },
    {
      label: 'openInCalendar',
      run: async () => (await event()).openInCalendar({ allowsEditing: true }),
    },
    { label: 'editInCalendar', run: async () => (await event()).editInCalendar() },
    {
      label: 'update (event)',
      run: async () => (await event()).update({ title: `${form.title} (updated)`, location: null }),
    },
    { label: 'delete (event)', run: async () => (await event()).delete() },
  ]}
/>
<CallConsole
  prefix="calendar-attendee-reminder"
  title="ExpoCalendarAttendee and ExpoCalendarReminder"
  {color}
  calls={[
    {
      label: 'update (attendee, first)',
      run: async () => (await firstAttendee()).update({ name: 'Renamed Guest' }),
    },
    { label: 'delete (attendee, first)', run: async () => (await firstAttendee()).delete() },
    { label: 'ExpoCalendarReminder.get', run: async () => reminderSummary(await reminder()) },
    {
      label: 'update (reminder)',
      run: async () =>
        (await reminder()).update({ title: `${form.title} (updated)`, completed: true }),
    },
    { label: 'delete (reminder)', run: async () => (await reminder()).delete() },
  ]}
/>
