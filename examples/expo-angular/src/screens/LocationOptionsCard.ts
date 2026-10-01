import { Component, input, model } from '@angular/core';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { ACCURACIES } from './location-options';
import type { IOptionsForm } from './location-options';

@Component({
  selector: 'LocationOptionsCard',
  standalone: true,
  imports: [Card, ChoiceRow, Field, ToggleRow],
  template: `
    <Card testID="location-options-card" title="Position options">
      <ChoiceRow
        testID="location-accuracy"
        label="accuracy"
        [options]="accuracies"
        [value]="form().accuracy"
        (valueChange)="patch({ accuracy: $event })"
        [color]="color()"
      />
      <ToggleRow
        testID="location-dialog-switch"
        label="mayShowUserSettingsDialog (Android)"
        [value]="form().mayShowUserSettingsDialog"
        (valueChange)="patch({ mayShowUserSettingsDialog: $event })"
        [color]="color()"
      />
      <Field
        testID="location-time-input"
        label="timeInterval (ms, Android)"
        [value]="form().timeInterval"
        (valueChange)="patch({ timeInterval: $event })"
      />
      <Field
        testID="location-distance-input"
        label="distanceInterval (meters)"
        [value]="form().distanceInterval"
        (valueChange)="patch({ distanceInterval: $event })"
      />
      <Field
        testID="location-max-age-input"
        label="maxAge (ms, last known)"
        [value]="form().maxAge"
        (valueChange)="patch({ maxAge: $event })"
      />
      <Field
        testID="location-required-accuracy-input"
        label="requiredAccuracy (meters, last known)"
        [value]="form().requiredAccuracy"
        (valueChange)="patch({ requiredAccuracy: $event })"
      />
    </Card>
  `,
})
export class LocationOptionsCard {
  readonly form = model.required<IOptionsForm>();
  readonly color = input.required<string>();
  readonly accuracies = ACCURACIES;

  patch(change: Partial<IOptionsForm>): void {
    this.form.update(current => ({ ...current, ...change }));
  }
}
