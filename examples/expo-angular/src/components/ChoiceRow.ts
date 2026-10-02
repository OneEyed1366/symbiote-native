import { Component, input, model } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from './ActionButton';

export type IChoiceOption<T> = { label: string; value: T };

@Component({
  selector: 'ChoiceRow',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <view [testID]="testID()">
      <text class="capability-label">{{ label() }}</text>
      <view class="button-row">
        @for (option of options(); track option.label) {
          <ActionButton
            [testID]="testID() + '-' + option.label"
            [title]="
              option.value === value() ? '● ' + option.label : option.label
            "
            [color]="color()"
            (press)="value.set(option.value)"
          />
        }
      </view>
    </view>
  `,
})
export class ChoiceRow<T extends string | number | boolean | undefined> {
  readonly testID = input.required<string>();
  readonly label = input.required<string>();
  readonly options = input.required<readonly IChoiceOption<T>[]>();
  readonly color = input.required<string>();
  readonly value = model.required<T>();
}
