import { Component, computed, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import type { ITourRouteName } from '../navigation-lines';

// Line tag and intro card every demo screen leads with, tinted by the screen's own line
@Component({
  selector: 'ScreenHero',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [class]="tagClass()">
      <text class="line-tag-text">{{ tagLabel() }}</text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" [style]="badgeStyle()">
        <text class="hero-badge-text">{{ info().code }}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">{{ title() }}</text>
        <text class="hero-body">{{ body() }}</text>
      </view>
    </view>
  `,
})
export class ScreenHero {
  readonly route = input.required<ITourRouteName>();
  readonly title = input.required<string>();
  readonly body = input.required<string>();

  readonly info = computed(() => ROUTE_LINE_INFO[this.route()]);
  readonly tagClass = computed(() => `line-tag line-tag-${this.info().line}`);
  readonly tagLabel = computed(
    () => `${this.info().code} · ${this.info().label}`,
  );
  readonly badgeStyle = computed(() => ({
    backgroundColor: LINE_COLOR[this.info().line],
  }));
}
