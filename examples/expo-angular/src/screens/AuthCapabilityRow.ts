import { Component, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { CAPABILITY_LABEL } from '../components/capability-status';
import type { ICapabilityStatus } from '../components/capability-status';

@Component({
  selector: 'AuthCapabilityRow',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [testID]="testID()" class="auth-capability-row">
      <text class="auth-capability-label">{{ label() }}</text>
      <view [class]="'auth-status-badge auth-status-badge-' + status()">
        <text class="auth-status-text">{{ statusLabel[status()] }}</text>
      </view>
    </view>
  `,
})
export class AuthCapabilityRow {
  readonly testID = input.required<string>();
  readonly label = input.required<string>();
  readonly status = input.required<ICapabilityStatus>();

  readonly statusLabel = CAPABILITY_LABEL;
}
