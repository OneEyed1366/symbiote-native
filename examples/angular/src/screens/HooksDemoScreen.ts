import { Component, signal, type Signal } from '@angular/core';
import { SafeAreaViewElement, Text, View } from '@symbiote-native/angular';
import {
  injectFocusEffect,
  injectIsFocused,
  injectNavigationState,
} from '@symbiote-native/navigation/angular';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

/**
 * Hooks demo: injectFocusEffect increments a signal every time this screen (re)gains focus and
 * records the moment it loses it; injectIsFocused visibly renders the live true/false; injectNavigationState
 * selects the whole route-name stack straight out of the root Stack's reducer state and renders
 * it as a list - navigate away and back (or push another screen) to watch all three update.
 * Angular twin of ../../react/screens/HooksDemoScreen.tsx - a `signal()` per piece of local state
 * instead of useState, so template reads stay reactive with zero manual change-detection calls.
 */
@Component({
  selector: 'HooksDemoScreen',
  standalone: true,
  imports: [SafeAreaViewElement, Text, View],
  template: `
    <safe-area-view class="screen">
      <view class="section">
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">HK</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Hooks</text>
            <text class="hero-body">
              injectFocusEffect, injectIsFocused, and injectNavigationState -
              introspecting the navigator's own live state from inside a screen.
            </text>
          </view>
        </view>
        <text testID="hooks-is-focused" class="info-text">{{
          'injectIsFocused(): ' + isFocused()
        }}</text>
        <text testID="hooks-focus-count" class="info-text">{{
          'injectFocusEffect focus count: ' + focusCount()
        }}</text>
        <text class="info-text">{{ blurText() }}</text>
        <text class="section-label"
          >injectNavigationState() · current route stack</text
        >
        @for (
          name of routeNames();
          track name + '-' + $index;
          let index = $index
        ) {
          <text class="list-row-text">{{ index + '. ' + name }}</text>
        }
      </view>
    </safe-area-view>
  `,
})
export class HooksDemoScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.HooksDemo];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeStyle = { backgroundColor: LINE_COLOR.introspection };

  readonly focusCount = signal(0);
  readonly lastBlurAt = signal<number | undefined>(undefined);

  readonly isFocused: Signal<boolean>;
  readonly routeNames: Signal<string[]>;

  constructor() {
    this.isFocused = injectIsFocused();
    this.routeNames = injectNavigationState(state =>
      state.routes.map(route => route.name),
    );

    injectFocusEffect(() => {
      this.focusCount.update(count => count + 1);
      return () => this.lastBlurAt.set(Date.now());
    });
  }

  blurText(): string {
    const at = this.lastBlurAt();
    return at === undefined ? 'not blurred yet' : `last blurred at ${at}`;
  }
}
