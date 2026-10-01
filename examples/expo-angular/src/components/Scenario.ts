import { Component, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';

// One user task: what it is for, what to do on the device, what must be seen afterwards
@Component({
  selector: 'Scenario',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [testID]="testID()" class="scenario-card">
      <text class="scenario-title">{{ title() }}</text>
      <text class="scenario-why">{{ why() }}</text>
      <view class="scenario-steps">
        @for (step of steps(); track step; let index = $index) {
          <text class="scenario-step">{{ index + 1 }}. {{ step }}</text>
        }
      </view>
      <ng-content />
      <view class="scenario-expect">
        <text class="scenario-expect-label">Expected</text>
        <text class="scenario-expect-text">{{ expect() }}</text>
      </view>
    </view>
  `,
})
export class Scenario {
  readonly testID = input.required<string>();
  readonly title = input.required<string>();
  readonly why = input.required<string>();
  readonly steps = input.required<readonly string[]>();
  readonly expect = input.required<string>();
}
