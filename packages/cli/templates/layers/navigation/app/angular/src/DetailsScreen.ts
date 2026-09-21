import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectStackNavigation } from '@symbiote-native/navigation/angular';
import './App.css';

@Component({
  selector: 'DetailsScreen',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view class="screen">
      <view class="details-card">
        <text class="details-title">You made it!</text>
        <text class="details-body">This screen was pushed by the Stack navigator — proof navigation actually works.</text>
      </view>
      <pressable class="button-secondary" (press)="navigation.pop()">
        <text class="button-secondary-text">Go back</text>
      </pressable>
    </safe-area-view>
  `,
})
export class DetailsScreen {
  readonly navigation = injectStackNavigation();
}
