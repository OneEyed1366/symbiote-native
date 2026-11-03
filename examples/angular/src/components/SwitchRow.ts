import { Component, computed, input, output } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { TRACK_OFF } from '../screens/canary-shared';

// Label on the left, native switch on the right, tinted by the caller's line colour
@Component({
  selector: 'SwitchRow',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view class="switch-row">
      <text class="switch-row-label">{{ label() }}</text>
      <switch
        [testID]="testID()"
        [value]="value()"
        (valueChange)="valueChange.emit($event)"
        [trackColor]="track()"
      ></switch>
    </view>
  `,
})
export class SwitchRow {
  readonly testID = input.required<string>();
  readonly label = input.required<string>();
  readonly value = input.required<boolean>();
  readonly color = input.required<string>();
  readonly valueChange = output<boolean>();

  readonly track = computed(() => ({ false: TRACK_OFF, true: this.color() }));
}
