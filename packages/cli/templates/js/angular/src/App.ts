import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import './App.css';

@Component({
  selector: 'symbiote-angular-app',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view class="screen">
      <view class="brand-row">
        <image class="brand-logo brand-logo-react" resizeMode="contain" [source]="reactNativeLogo"></image>
        <image class="plus-icon" resizeMode="contain" [source]="plusIcon"></image>
        <image class="brand-logo brand-logo-angular" resizeMode="contain" [source]="angularLogo"></image>
      </view>

      <text class="title">Welcome to SymbioteNative!</text>
      <text class="subtitle">Framework-agnostic React Native, driven by Angular.</text>

      <view class="counter-card">
        <text class="counter-label">TAPS</text>
        <text class="counter-value">{{ count() }}</text>
      </view>

      <pressable class="button-primary" (press)="increment()">
        <text class="button-primary-text">Tap me</text>
      </pressable>
    </safe-area-view>
  `,
})
export class AppComponent {
  readonly count = signal(0);
  readonly reactNativeLogo = require('./assets/react-native-logo.png');
  readonly plusIcon = require('./assets/plus-icon.png');
  readonly angularLogo = require('./assets/angular-logo.png');

  increment(): void {
    this.count.set(this.count() + 1);
  }
}
