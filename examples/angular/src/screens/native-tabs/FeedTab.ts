import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';

const FEED_ROW_COUNT = 40;

// Long enough to scroll, which the minimize behavior and the repeated tap both need
@Component({
  selector: 'FeedTab',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <scroll-view testID="native-tabs-feed" class="screen">
      <view class="scroll-content">
        @for (row of rows; track row) {
          <view class="recipe">
            <text class="list-row-text">Feed item {{ row }}</text>
          </view>
        }
      </view>
    </scroll-view>
  `,
})
export class FeedTab {
  readonly rows = Array.from(
    { length: FEED_ROW_COUNT },
    (_, index) => index + 1,
  );
}
