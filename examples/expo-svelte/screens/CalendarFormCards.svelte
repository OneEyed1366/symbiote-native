<script lang="ts">
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import {
    ACCESS_LEVELS,
    ALARM_METHODS,
    AVAILABILITIES,
    FREQUENCIES,
    STATUSES,
  } from './calendar-form';
  import type { IForm, ISetForm } from './calendar-form';

  let { form, setForm, color }: { form: IForm; setForm: ISetForm; color: string } = $props();
</script>

<Card testID="calendar-form-card" title="Event and reminder template">
  <Field testID="calendar-title-input" label="title" value={form.title} onChange={title => setForm({ title })} />
  <Field testID="calendar-location-input" label="location" value={form.location} onChange={location => setForm({ location })} />
  <Field testID="calendar-notes-input" label="notes" value={form.notes} onChange={notes => setForm({ notes })} />
  <ToggleRow testID="calendar-all-day-switch" label="allDay" value={form.allDay} onChange={allDay => setForm({ allDay })} {color} />
  <ToggleRow testID="calendar-guests-modify-switch" label="guestsCanModify (Android)" value={form.guestsCanModify} onChange={guestsCanModify => setForm({ guestsCanModify })} {color} />
  <ToggleRow testID="calendar-guests-invite-switch" label="guestsCanInviteOthers (Android)" value={form.guestsCanInviteOthers} onChange={guestsCanInviteOthers => setForm({ guestsCanInviteOthers })} {color} />
  <ToggleRow testID="calendar-guests-see-switch" label="guestsCanSeeGuests (Android)" value={form.guestsCanSeeGuests} onChange={guestsCanSeeGuests => setForm({ guestsCanSeeGuests })} {color} />
</Card>
<Card testID="calendar-choice-card" title="Enums, recurrence and alarm">
  <ChoiceRow testID="calendar-availability" label="availability" options={AVAILABILITIES} value={form.availability} onChange={availability => setForm({ availability })} {color} />
  <ChoiceRow testID="calendar-status" label="status" options={STATUSES} value={form.status} onChange={status => setForm({ status })} {color} />
  <ChoiceRow testID="calendar-access-level" label="accessLevel (Android)" options={ACCESS_LEVELS} value={form.accessLevel} onChange={accessLevel => setForm({ accessLevel })} {color} />
  <ChoiceRow testID="calendar-frequency" label="recurrenceRule.frequency" options={FREQUENCIES} value={form.frequency} onChange={frequency => setForm({ frequency })} {color} />
  <Field testID="calendar-interval-input" label="recurrenceRule.interval" value={form.interval} onChange={interval => setForm({ interval })} />
  <ToggleRow testID="calendar-monday-switch" label="recurrenceRule.daysOfTheWeek: Monday only" value={form.isMondayOnly} onChange={isMondayOnly => setForm({ isMondayOnly })} {color} />
  <Field testID="calendar-alarm-offset-input" label="alarms[0].relativeOffset (minutes)" value={form.alarmOffset} onChange={alarmOffset => setForm({ alarmOffset })} />
  <ChoiceRow testID="calendar-alarm-method" label="alarms[0].method (Android)" options={ALARM_METHODS} value={form.alarmMethod} onChange={alarmMethod => setForm({ alarmMethod })} {color} />
</Card>
