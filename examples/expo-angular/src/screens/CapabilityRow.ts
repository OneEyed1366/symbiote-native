import { Component, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { CAPABILITY_LABEL } from '../components/capability-status';
import type { ICapabilityStatus } from '../components/capability-status';

@Component({
  selector: 'CapabilityRow',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [testID]="testID()" class="capability-row">
      <text class="capability-label">{{ label() }}</text>
      <view [class]="'status-badge status-badge-' + status()">
        <text class="status-badge-text">{{ statusLabel[status()] }}</text>
      </view>
    </view>
  `,
})
export class CapabilityRow {
  readonly testID = input.required<string>();
  readonly label = input.required<string>();
  readonly status = input.required<ICapabilityStatus>();

  readonly statusLabel = CAPABILITY_LABEL;
}
