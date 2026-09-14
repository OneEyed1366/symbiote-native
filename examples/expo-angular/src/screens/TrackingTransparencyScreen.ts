import { Component, inject, signal } from '@angular/core';
import {
  SafeAreaViewElement,
  ScrollViewElement,
  Text,
  View,
} from '@symbiote-native/angular';
import {
  PermissionsService,
  getAdvertisingId,
} from '@symbiote-native/tracking-transparency/angular';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

/**
 * @symbiote-native/tracking-transparency canary demo: a permission card driven by
 * PermissionsService (connect() auto-fetches once; get()/request() are imperative one-shot
 * methods), plus the synchronous getAdvertisingId() — null on the iOS Simulator, before
 * authorization, or when the user declined. Angular twin of
 * ../../react/screens/TrackingTransparencyScreen.tsx.
 */
@Component({
  selector: 'TrackingTransparencyScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaViewElement, ScrollViewElement, Text, View],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="tracking-transparency-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">{{ heroBadgeCode }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Tracking Transparency</text>
            <text class="hero-body">
              @symbiote-native/tracking-transparency — App Tracking Transparency
              permission (iOS-only; Android/web always resolve granted) plus the
              advertising ID.
            </text>
          </view>
        </view>

        <view
          testID="tracking-transparency-permission-card"
          class="capability-card"
        >
          <text class="capability-card-title">Permission</text>
          <view class="capability-row">
            <text class="capability-label">Status</text>
            <text testID="tracking-transparency-status" class="value-text">{{
              statusLabel()
            }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Granted</text>
            <text testID="tracking-transparency-granted" class="value-text">{{
              grantedLabel()
            }}</text>
          </view>
          <view class="button-row">
            <ActionButton
              testID="tracking-transparency-get-button"
              title="Get"
              [color]="lineColor"
              (press)="handleGet()"
            ></ActionButton>
            <ActionButton
              testID="tracking-transparency-request-button"
              title="Request"
              [color]="lineColor"
              (press)="handleRequest()"
            ></ActionButton>
          </view>
        </view>

        <view
          testID="tracking-transparency-advertising-id-card"
          class="capability-card"
        >
          <text class="capability-card-title">Advertising ID</text>
          <view class="capability-row">
            <text class="capability-label">getAdvertisingId()</text>
            <text
              testID="tracking-transparency-advertising-id"
              class="value-text"
              >{{ advertisingIdLabel() }}</text
            >
          </view>
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class TrackingTransparencyScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TrackingTransparency];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  private readonly permissionsService = inject(PermissionsService);
  readonly status = this.permissionsService.connect();

  readonly advertisingId = signal<string | null>(getAdvertisingId());

  handleGet(): void {
    void this.permissionsService.get();
  }

  handleRequest(): void {
    this.permissionsService
      .request()
      .then(() => this.advertisingId.set(getAdvertisingId()));
  }

  statusLabel(): string {
    return this.status()?.status ?? 'checking…';
  }

  grantedLabel(): string {
    const status = this.status();
    return status === null ? 'checking…' : String(status.granted);
  }

  advertisingIdLabel(): string {
    return this.advertisingId() ?? 'not available';
  }
}
