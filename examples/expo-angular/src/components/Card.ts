import { Component, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';

@Component({
  selector: 'Card',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [testID]="testID()" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">{{ title() }}</text>
      </view>
      <ng-content />
    </view>
  `,
})
export class Card {
  readonly testID = input.required<string>();
  readonly title = input.required<string>();
}
