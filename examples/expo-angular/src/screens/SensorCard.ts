import { Component, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { SENSOR_STATUS, SENSOR_STATUS_TEXT } from './sensor-status';
import type { ISensorStatus } from './sensor-status';

@Component({
  selector: 'SensorCard',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [testID]="testID()" class="sensor-card">
      <view class="sensor-card-header">
        <text class="sensor-card-title">{{ title() }}</text>
        <view [class]="'sensor-status-badge sensor-status-badge-' + status()">
          <text class="sensor-status-text">{{ statusText[status()] }}</text>
        </view>
      </view>
      @switch (status()) {
        @case (statuses.checking) {
          <text class="info-text">checking availability…</text>
        }
        @case (statuses.unavailable) {
          <text class="info-text">not available on this device</text>
        }
        @case (statuses.waiting) {
          <text class="info-text">waiting for first reading…</text>
        }
        @default {
          <ng-content />
        }
      }
    </view>
  `,
})
export class SensorCard {
  readonly testID = input.required<string>();
  readonly title = input.required<string>();
  readonly status = input.required<ISensorStatus>();

  readonly statuses = SENSOR_STATUS;
  readonly statusText = SENSOR_STATUS_TEXT;
}
