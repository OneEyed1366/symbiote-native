import { Component, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';

export type IAxisMeasurement = { x: number; y: number; z: number };

@Component({
  selector: 'AxisReadingRow',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view class="sensor-reading-row">
      <view class="sensor-reading-chip">
        <text class="sensor-reading-label">X</text>
        <text class="sensor-reading-value">{{
          measurement().x.toFixed(3)
        }}</text>
      </view>
      <view class="sensor-reading-chip">
        <text class="sensor-reading-label">Y</text>
        <text class="sensor-reading-value">{{
          measurement().y.toFixed(3)
        }}</text>
      </view>
      <view class="sensor-reading-chip">
        <text class="sensor-reading-label">Z</text>
        <text class="sensor-reading-value">{{
          measurement().z.toFixed(3)
        }}</text>
      </view>
    </view>
  `,
})
export class AxisReadingRow {
  readonly measurement = input.required<IAxisMeasurement>();
}
