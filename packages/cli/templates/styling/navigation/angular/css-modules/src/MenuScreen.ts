import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectStackNavigation } from '@symbiote-native/navigation/angular';
import stylesModule from './App.module.css';

@Component({
  selector: 'MenuScreen',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [class]="containerClass">
      <text>Welcome to SymbioteNative!</text>
      <pressable (press)="navigation.push('Details')">
        <text>Go to Details</text>
      </pressable>
    </view>
  `,
})
export class MenuScreen {
  readonly containerClass = stylesModule.container;
  readonly navigation = injectStackNavigation();
}
