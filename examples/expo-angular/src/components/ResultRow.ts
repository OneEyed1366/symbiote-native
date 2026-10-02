import { Component, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';

@Component({
  selector: 'ResultRow',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view class="capability-row">
      <text class="capability-label">{{ label() }}</text>
      <text [testID]="testID()" class="value-text">{{ value() }}</text>
    </view>
  `,
})
export class ResultRow {
  readonly testID = input.required<string>();
  readonly label = input.required<string>();
  readonly value = input.required<string>();
}
