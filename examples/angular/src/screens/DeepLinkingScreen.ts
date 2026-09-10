import { Component, signal } from '@angular/core';
import {
  SafeAreaViewElement,
  Text,
  TextInputElement,
  View,
} from '@symbiote-native/angular';
import { resolveRouteFromUrl } from '@symbiote-native/navigation';
import { ActionButton } from '../components/ActionButton';
import {
  APP_LINKING_CONFIG,
  SAMPLE_DEEP_LINK_URL,
} from '../navigation-linking';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

/**
 * Deep-linking demo: APP_LINKING_CONFIG (navigation-linking.ts) is the SAME config wired at the
 * root via injectLinkingIntegration (App.ts) for real OS deep links — here resolveRouteFromUrl is
 * called directly against a typed-in URL so the resolution itself is provable inside the running
 * app without needing an actual OS-level deep link. Angular twin of
 * ../../react/screens/DeepLinkingScreen.tsx.
 */
@Component({
  selector: 'DeepLinkingScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaViewElement, Text, TextInputElement, View],
  template: `
    <safe-area-view class="screen">
      <view class="section">
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">DL</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Deep linking</text>
            <text class="hero-body">
              A typed URL resolved to a route through resolveRouteFromUrl, the
              same path a real deep link or push notification would take.
            </text>
          </view>
        </view>
        <text class="info-text">
          prefixes: symbiotecanaryangular:// ·
          https://canary-angular.symbiote-native.dev
        </text>
        <text class="note-text"
          >Details → details/:id · HeaderOptions → header-options · TabsDemo →
          tabs</text
        >
        <text-input
          testID="deep-link-input"
          [(value)]="url"
          placeholder="symbiotecanaryangular://details/42"
          placeholderTextColor="#41506a"
          class="text-input"
        ></text-input>
        <ActionButton
          testID="deep-link-resolve"
          title="Resolve"
          (press)="onResolve()"
          [color]="lineColorRouting"
        ></ActionButton>
        <view class="parity-list">
          <text testID="deep-link-result" class="list-row-text">{{
            resultText()
          }}</text>
        </view>
      </view>
    </safe-area-view>
  `,
})
export class DeepLinkingScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DeepLinking];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly lineColorRouting = LINE_COLOR.routing;
  readonly heroBadgeStyle = { backgroundColor: LINE_COLOR.routing };

  url = SAMPLE_DEEP_LINK_URL;
  private readonly resolved = signal<string | undefined>(undefined);

  onResolve(): void {
    const resolvedRoute = resolveRouteFromUrl(APP_LINKING_CONFIG, this.url);
    this.resolved.set(JSON.stringify(resolvedRoute, null, 2));
  }

  resultText(): string {
    return this.resolved() ?? 'tap Resolve to see the parsed route';
  }
}
