import { Component, computed, inject } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  TrackingPermissionsService,
  getAdvertisingId,
} from '@symbiote-native/tracking-transparency/angular';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ValueRow } from './ValueRow';

const PENDING_LABEL = 'checking…';

@Component({
  selector: 'TrackingTransparencyScreen',
  standalone: true,
  imports: [ActionButton, Scenario, SYMBIOTE_ELEMENTS, ValueRow],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="tracking-transparency-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="'line-tag line-tag-' + lineInfo.line">
          <text class="line-tag-text"
            >{{ lineInfo.code }} · {{ lineInfo.label }}</text
          >
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="badgeStyle">
            <text class="hero-badge-text">{{ lineInfo.code }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Tracking Transparency</text>
            <text class="hero-body">
              Ask permission to track the user across apps before you use the
              advertising id. iOS shows the App Tracking Transparency prompt,
              Android always reports granted.
            </text>
          </view>
        </view>

        <Scenario
          testID="tracking-transparency-scenario"
          title="Ask before using the advertising id"
          why="Apple requires the tracking prompt before an app reads the advertising id for ads or attribution. Without consent the id is empty, so the app must work either way."
          [steps]="scenarioSteps"
          expect="The status changes to granted or denied after your answer. The id shows a value only after consent on a real iOS device and is null elsewhere."
        />

        <view
          testID="tracking-transparency-permission-card"
          class="feature-card"
        >
          <view class="feature-card-header">
            <text class="feature-card-title">Permission</text>
          </view>
          <ValueRow label="Status" [value]="statusText()" />
          <ValueRow label="Granted" [value]="grantedText()" />
          <ActionButton
            testID="tracking-transparency-get-button"
            title="Get"
            [color]="lineColor"
            (press)="getPermission()"
          />
          <ActionButton
            testID="tracking-transparency-request-button"
            title="Request"
            [color]="lineColor"
            (press)="requestPermission()"
          />
        </view>

        <view
          testID="tracking-transparency-advertising-id-card"
          class="feature-card"
        >
          <view class="feature-card-header">
            <text class="feature-card-title">Advertising ID</text>
          </view>
          <ValueRow label="Advertising ID" [value]="advertisingId ?? 'null'" />
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class TrackingTransparencyScreen {
  readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TrackingTransparency];
  readonly lineColor = LINE_COLOR['tracking-transparency'];
  readonly badgeStyle = {
    backgroundColor: LINE_COLOR['tracking-transparency'],
  };
  readonly scenarioSteps = [
    'Press Get to read the current status',
    'Press Request and answer the system prompt',
    'Read the advertising id below',
  ];

  private readonly permissions = inject(TrackingPermissionsService);
  private readonly status = this.permissions.connect();
  // Synchronous native read, `null` on Android and the iOS simulator
  readonly advertisingId: string | null = getAdvertisingId();

  readonly statusText = computed(() => this.status()?.status ?? PENDING_LABEL);
  readonly grantedText = computed(() => {
    const status = this.status();
    if (status === null) return PENDING_LABEL;
    return status.granted ? 'Yes' : 'No';
  });

  getPermission(): void {
    void this.permissions.get();
  }

  requestPermission(): void {
    void this.permissions.request();
  }
}
