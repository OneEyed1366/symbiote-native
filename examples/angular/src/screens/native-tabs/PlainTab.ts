import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';

@Component({
  selector: 'InboxTab',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view testID="native-tabs-inbox" class="screen">
      <view class="scroll-content">
        <text class="info-text">Inbox carries the badge</text>
      </view>
    </view>
  `,
})
export class InboxTab {}

@Component({
  selector: 'LockedTab',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view testID="native-tabs-locked-tab" class="screen">
      <view class="scroll-content">
        <text class="info-text">You opened Locked</text>
      </view>
    </view>
  `,
})
export class LockedTab {}

@Component({
  selector: 'SearchTab',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view testID="native-tabs-search-tab" class="screen">
      <view class="scroll-content">
        <text class="info-text">The search role tab</text>
      </view>
    </view>
  `,
})
export class SearchTab {}
