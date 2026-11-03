import { Component, Input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';

// One titled block of the Reanimated screen
@Component({
  selector: 'Section',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view class="ra-section">
      <text class="ra-section-title">{{ title }}</text>
      @if (note !== undefined) {
        <text class="ra-note">{{ note }}</text>
      }
      <ng-content />
    </view>
  `,
})
export class Section {
  @Input({ required: true }) title = '';
  @Input() note?: string;
}
