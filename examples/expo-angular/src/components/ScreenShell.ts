import { Component, computed, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import type { ITourRouteName } from '../navigation-lines';

// Line tag + hero card + scroll container shared by every demo screen
@Component({
  selector: 'ScreenShell',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        [testID]="testID()"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="'line-tag line-tag-' + lineInfo().line">
          <text class="line-tag-text"
            >{{ lineInfo().code }} · {{ lineInfo().label }}</text
          >
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="badgeStyle()">
            <text class="hero-badge-text">{{ lineInfo().code }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">{{ title() }}</text>
            <text class="hero-body">{{ body() }}</text>
          </view>
        </view>
        <ng-content />
      </scroll-view>
    </safe-area-view>
  `,
})
export class ScreenShell {
  readonly route = input.required<ITourRouteName>();
  readonly title = input.required<string>();
  readonly body = input.required<string>();
  readonly testID = input.required<string>();

  readonly lineInfo = computed(() => ROUTE_LINE_INFO[this.route()]);
  readonly badgeStyle = computed(() => ({
    backgroundColor: LINE_COLOR[this.lineInfo().line],
  }));
}
