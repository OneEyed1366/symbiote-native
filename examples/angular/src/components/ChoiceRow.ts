import { Component, input, output } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';

const SELECTED_TEXT_COLOR = '#0b1622';

// A row of pills for an option with a few fixed values, the chosen one is filled
@Component({
  selector: 'ChoiceRow',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [testID]="testID()" class="choice-row">
      @for (option of options(); track option) {
        <pressable
          [testID]="testID() + '-' + option"
          class="choice-chip"
          (press)="valueChange.emit(option)"
          [style]="chipStyle(option)"
        >
          <text class="choice-chip-text" [style]="chipTextStyle(option)">{{
            option
          }}</text>
        </pressable>
      }
    </view>
  `,
})
export class ChoiceRow<T extends string> {
  readonly testID = input.required<string>();
  readonly value = input.required<T>();
  readonly options = input.required<readonly T[]>();
  readonly color = input.required<string>();
  readonly valueChange = output<T>();

  chipStyle(option: T): Record<string, unknown> {
    return {
      borderColor: this.color(),
      backgroundColor: option === this.value() ? this.color() : 'transparent',
    };
  }

  chipTextStyle(option: T): Record<string, unknown> {
    return {
      color: option === this.value() ? SELECTED_TEXT_COLOR : this.color(),
    };
  }
}
