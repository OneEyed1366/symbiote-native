import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectStackNavigation } from '@symbiote-native/navigation/angular';
import stylesModule from './App.module.css';

@Component({
  selector: 'DetailsScreen',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view [class]="stylesModule['screen']">
      <view [class]="stylesModule['details-card']">
        <text [class]="stylesModule['details-title']">You made it!</text>
        <text [class]="stylesModule['details-body']">This screen was pushed by the Stack navigator — proof navigation actually works.</text>
      </view>
      <pressable [class]="stylesModule['button-secondary']" (press)="navigation.pop()">
        <text [class]="stylesModule['button-secondary-text']">Go back</text>
      </pressable>
    </safe-area-view>
  `,
})
export class DetailsScreen {
  readonly stylesModule = stylesModule;
  readonly navigation = injectStackNavigation();
}
