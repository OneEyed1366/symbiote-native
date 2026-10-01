<script setup lang="ts">
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import {
  ACCESS_LEVELS,
  ALARM_METHODS,
  AVAILABILITIES,
  FREQUENCIES,
  STATUSES,
} from './calendar-form';
import type { IForm, ISetForm } from './calendar-form';

defineProps<{ form: IForm; setForm: ISetForm; color: string }>();
</script>

<template>
  <Card testID="calendar-form-card" title="Event and reminder template">
    <Field
      testID="calendar-title-input"
      label="title"
      :value="form.title"
      :onChange="title => setForm({ title })"
    />
    <Field
      testID="calendar-location-input"
      label="location"
      :value="form.location"
      :onChange="location => setForm({ location })"
    />
    <Field
      testID="calendar-notes-input"
      label="notes"
      :value="form.notes"
      :onChange="notes => setForm({ notes })"
    />
    <ToggleRow
      testID="calendar-all-day-switch"
      label="allDay"
      :value="form.allDay"
      :onChange="allDay => setForm({ allDay })"
      :color="color"
    />
    <ToggleRow
      testID="calendar-guests-modify-switch"
      label="guestsCanModify (Android)"
      :value="form.guestsCanModify"
      :onChange="guestsCanModify => setForm({ guestsCanModify })"
      :color="color"
    />
    <ToggleRow
      testID="calendar-guests-invite-switch"
      label="guestsCanInviteOthers (Android)"
      :value="form.guestsCanInviteOthers"
      :onChange="guestsCanInviteOthers => setForm({ guestsCanInviteOthers })"
      :color="color"
    />
    <ToggleRow
      testID="calendar-guests-see-switch"
      label="guestsCanSeeGuests (Android)"
      :value="form.guestsCanSeeGuests"
      :onChange="guestsCanSeeGuests => setForm({ guestsCanSeeGuests })"
      :color="color"
    />
  </Card>
  <Card testID="calendar-choice-card" title="Enums, recurrence and alarm">
    <ChoiceRow
      testID="calendar-availability"
      label="availability"
      :options="AVAILABILITIES"
      :value="form.availability"
      :onChange="availability => setForm({ availability })"
      :color="color"
    />
    <ChoiceRow
      testID="calendar-status"
      label="status"
      :options="STATUSES"
      :value="form.status"
      :onChange="status => setForm({ status })"
      :color="color"
    />
    <ChoiceRow
      testID="calendar-access-level"
      label="accessLevel (Android)"
      :options="ACCESS_LEVELS"
      :value="form.accessLevel"
      :onChange="accessLevel => setForm({ accessLevel })"
      :color="color"
    />
    <ChoiceRow
      testID="calendar-frequency"
      label="recurrenceRule.frequency"
      :options="FREQUENCIES"
      :value="form.frequency"
      :onChange="frequency => setForm({ frequency })"
      :color="color"
    />
    <Field
      testID="calendar-interval-input"
      label="recurrenceRule.interval"
      :value="form.interval"
      :onChange="interval => setForm({ interval })"
    />
    <ToggleRow
      testID="calendar-monday-switch"
      label="recurrenceRule.daysOfTheWeek: Monday only"
      :value="form.isMondayOnly"
      :onChange="isMondayOnly => setForm({ isMondayOnly })"
      :color="color"
    />
    <Field
      testID="calendar-alarm-offset-input"
      label="alarms[0].relativeOffset (minutes)"
      :value="form.alarmOffset"
      :onChange="alarmOffset => setForm({ alarmOffset })"
    />
    <ChoiceRow
      testID="calendar-alarm-method"
      label="alarms[0].method (Android)"
      :options="ALARM_METHODS"
      :value="form.alarmMethod"
      :onChange="alarmMethod => setForm({ alarmMethod })"
      :color="color"
    />
  </Card>
</template>
