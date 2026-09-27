import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import stylesModule from './App.module.css';

@Component({
  selector: 'symbiote-angular-app',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view [class]="stylesModule['screen']">
      <view [class]="stylesModule['brand-row']">
        <image
          [class]="stylesModule['brand-logo'] + ' ' + stylesModule['brand-logo-react']"
          resizeMode="contain"
          [source]="reactNativeLogo"
        ></image>
        <image [class]="stylesModule['plus-icon']" resizeMode="contain" [source]="plusIcon"></image>
        <image
          [class]="stylesModule['brand-logo'] + ' ' + stylesModule['brand-logo-angular']"
          resizeMode="contain"
          [source]="angularLogo"
        ></image>
      </view>

      <text [class]="stylesModule['title']">Welcome to SymbioteNative!</text>
      <text [class]="stylesModule['subtitle']">Framework-agnostic React Native, driven by Angular.</text>

      <view [class]="stylesModule['counter-card']">
        <text [class]="stylesModule['counter-label']">TAPS</text>
        <text [class]="stylesModule['counter-value']">{{ count() }}</text>
      </view>

      <pressable [class]="stylesModule['button-primary']" (press)="increment()">
        <text [class]="stylesModule['button-primary-text']">Tap me</text>
      </pressable>
    </safe-area-view>
  `,
})
export class AppComponent {
  readonly stylesModule = stylesModule;
  readonly count = signal(0);
  readonly reactNativeLogo = require('./assets/react-native-logo.png');
  readonly plusIcon = require('./assets/plus-icon.png');
  readonly angularLogo = require('./assets/angular-logo.png');

  increment(): void {
    this.count.set(this.count() + 1);
  }
}
