import { Component, input, output } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import type { ICheckboxProps } from '@symbiote-native/angular';

// The checkbox is itself the touch target, the label beside it is plain text as in expo-checkbox
@Component({
  selector: 'LabeledCheckbox',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view class="capability-row">
      <checkbox
        [testID]="testID()"
        [value]="value()"
        [color]="color()"
        [disabled]="disabled()"
        [onValueChange]="onBoxChange"
      />
      <text class="capability-label">{{ label() }}</text>
    </view>
  `,
})
export class LabeledCheckbox {
  readonly testID = input.required<string>();
  readonly label = input.required<string>();
  readonly value = input.required<boolean>();
  readonly color = input<string>();
  readonly disabled = input<boolean>(false);
  readonly changed = output<boolean>();

  readonly onBoxChange: NonNullable<ICheckboxProps['onValueChange']> = event =>
    this.changed.emit(event.value);
}
