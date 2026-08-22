import { Component, inject, signal } from '@angular/core';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/angular';
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
  imports: [ActionButton, SafeAreaView, ScrollView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView
        testID="tracking-transparency-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">{{ heroBadgeCode }}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Tracking Transparency</Text>
            <Text class="hero-body">
              @symbiote-native/tracking-transparency — App Tracking Transparency
              permission (iOS-only; Android/web always resolve granted) plus the
              advertising ID.
            </Text>
          </View>
        </View>

        <View
          testID="tracking-transparency-permission-card"
          class="capability-card"
        >
          <Text class="capability-card-title">Permission</Text>
          <View class="capability-row">
            <Text class="capability-label">Status</Text>
            <Text testID="tracking-transparency-status" class="value-text">{{
              statusLabel()
            }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Granted</Text>
            <Text testID="tracking-transparency-granted" class="value-text">{{
              grantedLabel()
            }}</Text>
          </View>
          <View class="button-row">
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
          </View>
        </View>

        <View
          testID="tracking-transparency-advertising-id-card"
          class="capability-card"
        >
          <Text class="capability-card-title">Advertising ID</Text>
          <View class="capability-row">
            <Text class="capability-label">getAdvertisingId()</Text>
            <Text
              testID="tracking-transparency-advertising-id"
              class="value-text"
              >{{ advertisingIdLabel() }}</Text
            >
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
