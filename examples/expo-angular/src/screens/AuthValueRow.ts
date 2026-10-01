import { Component, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';

@Component({
  selector: 'AuthValueRow',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view class="auth-capability-row">
      <text class="auth-capability-label">{{ label() }}</text>
      <text class="auth-value-text">{{ value() }}</text>
    </view>
  `,
})
export class AuthValueRow {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
}
