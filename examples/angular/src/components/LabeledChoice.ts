import { Component, input, output } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ChoiceRow } from './ChoiceRow';

// A caption over a row of pills, for panels that hold several choices
@Component({
  selector: 'LabeledChoice',
  standalone: true,
  imports: [ChoiceRow, SYMBIOTE_ELEMENTS],
  template: `
    <text class="switch-label">{{ label() }}</text>
    <ChoiceRow
      [testID]="testID()"
      [value]="value()"
      [options]="options()"
      [color]="color()"
      (valueChange)="valueChange.emit($event)"
    ></ChoiceRow>
  `,
})
export class LabeledChoice<T extends string> {
  readonly testID = input.required<string>();
  readonly label = input.required<string>();
  readonly value = input.required<T>();
  readonly options = input.required<readonly T[]>();
  readonly color = input.required<string>();
  readonly valueChange = output<T>();
}
