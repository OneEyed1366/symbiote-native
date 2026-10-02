import { Component, computed, signal } from '@angular/core';
import { requestAgeRangeAsync } from '@symbiote-native/age-range';
import type { IAgeRangeResponse } from '@symbiote-native/age-range';
import { ActionButton } from '../components/ActionButton';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { optionalNumber } from './age-range-fake';

function show(value: unknown): string {
  return String(value ?? 'null');
}

@Component({
  selector: 'AgeRangeRequestCard',
  standalone: true,
  imports: [ActionButton, Field, ResultRow, Scenario],
  template: `
    <Scenario
      testID="age-range-request-card"
      title="Check a user's age bracket without asking for a birth date"
      why="Laws on minors require age gates for some content and features. The OS already knows the family-verified age range and shares only the bracket the user approves, never the date of birth."
      [steps]="steps"
      expect="The status says done and the rows show which bracket applies, who declared it and which thresholds it fell between. On Android and older iOS the platform calls in the explorer are the way to test."
    >
      <Field
        testID="age-range-threshold1-input"
        label="threshold1 (required)"
        [(value)]="threshold1"
      />
      <Field
        testID="age-range-threshold2-input"
        label="threshold2"
        [(value)]="threshold2"
      />
      <Field
        testID="age-range-threshold3-input"
        label="threshold3"
        [(value)]="threshold3"
      />
      <ActionButton
        testID="age-range-request-button"
        title="Ask for age range"
        [color]="color"
        (press)="request()"
      />
      <ResultRow testID="age-range-status" label="Status" [value]="status()" />
      @for (row of rows(); track row[0]) {
        <ResultRow
          [testID]="'age-range-' + row[0].split(' ')[0]"
          [label]="row[0]"
          [value]="row[1]"
        />
      }
    </Scenario>
  `,
})
export class AgeRangeRequestCard {
  readonly color = lineColorOf(ROUTE_NAME.AgeRange);
  readonly steps = [
    'Keep the thresholds 13, 16 and 18',
    'Press Ask for age range',
    'Approve the system sheet (iOS 26+)',
  ];

  readonly threshold1 = signal('13');
  readonly threshold2 = signal('16');
  readonly threshold3 = signal('18');
  private readonly response = signal<IAgeRangeResponse | null>(null);
  readonly status = signal('idle');

  readonly rows = computed((): [string, string][] => {
    const current = this.response();
    if (current === null) {
      return [];
    }
    return [
      ['lowerBound', show(current.lowerBound)],
      ['upperBound', show(current.upperBound)],
      ['ageRangeDeclaration (iOS)', show(current.ageRangeDeclaration)],
      [
        'activeParentalControls (iOS)',
        show(current.activeParentalControls?.join(', ')),
      ],
      ['installId (Android)', show(current.installId)],
      ['ageRangeSource (Android)', show(current.ageRangeSource)],
      [
        'significantChangeStatus (Android)',
        show(current.significantChangeStatus),
      ],
      [
        'significantChangeApprovalDate (Android)',
        show(current.significantChangeApprovalDate),
      ],
      [
        'mostRecentApprovalDate (Android)',
        show(current.mostRecentApprovalDate),
      ],
    ];
  });

  request(): void {
    this.status.set('asking…');
    requestAgeRangeAsync({
      threshold1: Number(this.threshold1()),
      threshold2: optionalNumber(this.threshold2()),
      threshold3: optionalNumber(this.threshold3()),
    })
      .then(result => {
        this.response.set(result);
        this.status.set('done');
      })
      .catch((error: Error) => this.status.set(`failed: ${error.message}`));
  }
}
