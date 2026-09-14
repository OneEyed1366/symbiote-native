import { Component, inject } from '@angular/core';
import {
  ColorSchemeService,
  DynamicColorIOS,
  PlatformColor,
  Text,
  View,
} from '@symbiote-native/angular';
// static look lives in the compiled stylesheet
import './PlatformColorDemo.css';

@Component({
  selector: 'PlatformColorDemo',
  standalone: true,
  imports: [View, Text],
  template: `
    <view class="section-nested">
      <text class="section-label">{{
        'PlatformColor · semantic + DynamicColorIOS (' + schemeLabel + ')'
      }}</text>
      <view class="row">
        <view
          testID="system-blue-tile"
          class="color-tile"
          [style]="{ backgroundColor: systemBlue }"
        >
          <text class="tile-label">systemBlue</text>
        </view>
        <view
          testID="dynamic-color-tile"
          class="color-tile-bordered"
          [style]="{
            backgroundColor: dynamicBackground,
            borderColor: separatorColor,
          }"
        >
          <text class="bold-label" [style]="{ color: labelColor }"
            >dynamic</text
          >
        </view>
      </view>
    </view>
  `,
})
export class PlatformColorDemo {
  private readonly colorScheme = inject(ColorSchemeService).colorScheme;

  readonly systemBlue = PlatformColor('systemBlue');
  readonly dynamicBackground = DynamicColorIOS({
    light: '#dbeafe',
    dark: '#13243a',
  });
  readonly separatorColor = PlatformColor('separator');
  readonly labelColor = PlatformColor('label');

  get schemeLabel(): string {
    return this.colorScheme() ?? 'unknown';
  }
}
