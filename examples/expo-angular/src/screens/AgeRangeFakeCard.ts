import { Component, model } from '@angular/core';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { CHANGES, SIGNAL_STATUSES, SOURCES, choices } from './age-range-fake';
import type { IFakeForm } from './age-range-fake';

@Component({
  selector: 'AgeRangeFakeCard',
  standalone: true,
  imports: [Card, ChoiceRow, Field],
  template: `
    <Card
      testID="age-range-fake-card"
      title="setFakeAgeSignals form (Android testing)"
    >
      <Field
        testID="age-range-fake-lower-input"
        label="lowerBound"
        [value]="form().lower"
        (valueChange)="patch({ lower: $event })"
      />
      <Field
        testID="age-range-fake-upper-input"
        label="upperBound"
        [value]="form().upper"
        (valueChange)="patch({ upper: $event })"
      />
      <Field
        testID="age-range-fake-install-input"
        label="installId"
        [value]="form().installId"
        (valueChange)="patch({ installId: $event })"
      />
      <ChoiceRow
        testID="age-range-fake-source"
        label="ageRangeSource"
        [options]="sources"
        [value]="form().source"
        (valueChange)="patch({ source: $event })"
        [color]="color"
      />
      <ChoiceRow
        testID="age-range-fake-change"
        label="significantChangeStatus"
        [options]="changes"
        [value]="form().change"
        (valueChange)="patch({ change: $event })"
        [color]="color"
      />
      <Field
        testID="age-range-fake-approval-input"
        label="significantChangeApprovalDate (ms)"
        [value]="form().approval"
        (valueChange)="patch({ approval: $event })"
      />
      <ChoiceRow
        testID="age-range-fake-status"
        label="ageSignalsStatus"
        [options]="signalStatuses"
        [value]="form().signalStatus"
        (valueChange)="patch({ signalStatus: $event })"
        [color]="color"
      />
      <Field
        testID="age-range-fake-error-input"
        label="errorCode (overrides everything else)"
        [value]="form().errorCode"
        (valueChange)="patch({ errorCode: $event })"
      />
    </Card>
  `,
})
export class AgeRangeFakeCard {
  readonly form = model.required<IFakeForm>();
  readonly color = lineColorOf(ROUTE_NAME.AgeRange);
  readonly sources = choices(SOURCES);
  readonly changes = choices(CHANGES);
  readonly signalStatuses = choices(SIGNAL_STATUSES);

  patch(change: Partial<IFakeForm>): void {
    this.form.update(current => ({ ...current, ...change }));
  }
}
