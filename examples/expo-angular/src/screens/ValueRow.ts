import { Component, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';

@Component({
  selector: 'ValueRow',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view class="capability-row">
      <text class="capability-label">{{ label() }}</text>
      <text class="value-text">{{ value() }}</text>
    </view>
  `,
})
export class ValueRow {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
}
