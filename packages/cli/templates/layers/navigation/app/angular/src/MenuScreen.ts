import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectStackNavigation } from '@symbiote-native/navigation/angular';
import './App.css';

@Component({
  selector: 'MenuScreen',
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

      <view class="button-row">
        <pressable class="button-primary" (press)="count.update(v => v + 1)">
          <text class="button-primary-text">Tap me</text>
        </pressable>
        <pressable class="button-secondary" (press)="navigation.push('Details')">
          <text class="button-secondary-text">Go to Details</text>
        </pressable>
      </view>
    </safe-area-view>
  `,
})
export class MenuScreen {
  readonly navigation = injectStackNavigation();
  readonly count = signal(0);
  readonly reactNativeLogo = require('./assets/react-native-logo.png');
  readonly plusIcon = require('./assets/plus-icon.png');
  readonly angularLogo = require('./assets/angular-logo.png');
}
