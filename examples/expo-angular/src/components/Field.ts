import { Component, booleanAttribute, input, model } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';

@Component({
  selector: 'Field',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view>
      <text class="capability-label">{{ label() }}</text>
      <text-input
        [testID]="testID()"
        [value]="value()"
        [placeholder]="placeholder()"
        placeholderTextColor="#41506a"
        autoCapitalize="none"
        [multiline]="multiline()"
        class="text-input"
        (valueChange)="value.set($event)"
      />
    </view>
  `,
})
export class Field {
  readonly testID = input.required<string>();
  readonly label = input.required<string>();
  readonly value = model.required<string>();
  readonly placeholder = input<string>();
  readonly multiline = input(false, { transform: booleanAttribute });
}
