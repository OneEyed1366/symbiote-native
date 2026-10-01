import { Component, input, model } from '@angular/core';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import {
  ACCESS_LEVELS,
  ALARM_METHODS,
  AVAILABILITIES,
  FREQUENCIES,
  STATUSES,
} from './calendar-form';
import type { IForm } from './calendar-form';

@Component({
  selector: 'CalendarFormCards',
  standalone: true,
  imports: [Card, ChoiceRow, Field, ToggleRow],
  template: `
    <Card testID="calendar-form-card" title="Event and reminder template">
      <Field
        testID="calendar-title-input"
        label="title"
        [value]="form().title"
        (valueChange)="patch({ title: $event })"
      />
      <Field
        testID="calendar-location-input"
        label="location"
        [value]="form().location"
        (valueChange)="patch({ location: $event })"
      />
      <Field
        testID="calendar-notes-input"
        label="notes"
        [value]="form().notes"
        (valueChange)="patch({ notes: $event })"
      />
      <ToggleRow
        testID="calendar-all-day-switch"
        label="allDay"
        [value]="form().allDay"
        (valueChange)="patch({ allDay: $event })"
        [color]="color()"
      />
      <ToggleRow
        testID="calendar-guests-modify-switch"
        label="guestsCanModify (Android)"
        [value]="form().guestsCanModify"
        (valueChange)="patch({ guestsCanModify: $event })"
        [color]="color()"
      />
      <ToggleRow
        testID="calendar-guests-invite-switch"
        label="guestsCanInviteOthers (Android)"
        [value]="form().guestsCanInviteOthers"
        (valueChange)="patch({ guestsCanInviteOthers: $event })"
        [color]="color()"
      />
      <ToggleRow
        testID="calendar-guests-see-switch"
        label="guestsCanSeeGuests (Android)"
        [value]="form().guestsCanSeeGuests"
        (valueChange)="patch({ guestsCanSeeGuests: $event })"
        [color]="color()"
      />
    </Card>
    <Card testID="calendar-choice-card" title="Enums, recurrence and alarm">
      <ChoiceRow
        testID="calendar-availability"
        label="availability"
        [options]="availabilities"
        [value]="form().availability"
        (valueChange)="patch({ availability: $event })"
        [color]="color()"
      />
      <ChoiceRow
        testID="calendar-status"
        label="status"
        [options]="statuses"
        [value]="form().status"
        (valueChange)="patch({ status: $event })"
        [color]="color()"
      />
      <ChoiceRow
        testID="calendar-access-level"
        label="accessLevel (Android)"
        [options]="accessLevels"
        [value]="form().accessLevel"
        (valueChange)="patch({ accessLevel: $event })"
        [color]="color()"
      />
      <ChoiceRow
        testID="calendar-frequency"
        label="recurrenceRule.frequency"
        [options]="frequencies"
        [value]="form().frequency"
        (valueChange)="patch({ frequency: $event })"
        [color]="color()"
      />
      <Field
        testID="calendar-interval-input"
        label="recurrenceRule.interval"
        [value]="form().interval"
        (valueChange)="patch({ interval: $event })"
      />
      <ToggleRow
        testID="calendar-monday-switch"
        label="recurrenceRule.daysOfTheWeek: Monday only"
        [value]="form().isMondayOnly"
        (valueChange)="patch({ isMondayOnly: $event })"
        [color]="color()"
      />
      <Field
        testID="calendar-alarm-offset-input"
        label="alarms[0].relativeOffset (minutes)"
        [value]="form().alarmOffset"
        (valueChange)="patch({ alarmOffset: $event })"
      />
      <ChoiceRow
        testID="calendar-alarm-method"
        label="alarms[0].method (Android)"
        [options]="alarmMethods"
        [value]="form().alarmMethod"
        (valueChange)="patch({ alarmMethod: $event })"
        [color]="color()"
      />
    </Card>
  `,
})
export class CalendarFormCards {
  readonly form = model.required<IForm>();
  readonly color = input.required<string>();

  readonly availabilities = AVAILABILITIES;
  readonly statuses = STATUSES;
  readonly accessLevels = ACCESS_LEVELS;
  readonly frequencies = FREQUENCIES;
  readonly alarmMethods = ALARM_METHODS;

  patch(change: Partial<IForm>): void {
    this.form.update(current => ({ ...current, ...change }));
  }
}
