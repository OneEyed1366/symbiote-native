import { Component, signal } from '@angular/core';
import { Platform, SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  applicationId,
  applicationName,
  getAndroidId,
  getInstallReferrerAsync,
  getInstallationTimeAsync,
  getIosApplicationReleaseTypeAsync,
  getIosIdForVendorAsync,
  nativeApplicationVersion,
  nativeBuildVersion,
} from '@symbiote-native/application/angular';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ValueRow } from './ValueRow';

const UNKNOWN_LABEL = 'unknown';
const ANDROID_OS = 'android';
const IOS_OS = 'ios';

@Component({
  selector: 'ApplicationScreen',
  standalone: true,
  imports: [ActionButton, Scenario, SYMBIOTE_ELEMENTS, ValueRow],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="application-scroll"
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
            <text class="hero-title">Application</text>
            <text class="hero-body">
              Read what the app knows about itself: version, build number, name,
              bundle id, install date and store metadata. Use it for the About
              screen, support emails and crash reports.
            </text>
          </view>
        </view>

        <Scenario
          testID="application-scenario"
          title="Show the exact app version in About and support emails"
          why="Support needs to know precisely which build a user runs. The version and build number come from the native bundle, so they always match the installed binary."
          [steps]="scenarioSteps"
          expect="The values match the installed build (check Settings, General, iPhone Storage on iOS). Lookups that do not exist on this platform show as unavailable."
        />

        <view testID="application-constants-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Constants</text>
          </view>
          <ValueRow label="Version" [value]="version" />
          <ValueRow label="Build" [value]="build" />
          <ValueRow label="Name" [value]="name" />
          <ValueRow label="ID" [value]="id" />
        </view>

        <view testID="application-install-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Install time</text>
          </view>
          <ActionButton
            testID="application-installation-time-button"
            title="Get installation time"
            [color]="lineColor"
            (press)="getInstallationTime()"
          />
          @if (installedAt(); as value) {
            <ValueRow label="Installed at" [value]="value" />
          }
        </view>

        @if (isAndroid) {
          <view testID="application-android-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Android</text>
            </view>
            <ActionButton
              testID="application-android-id-button"
              title="Get Android ID"
              [color]="lineColor"
              (press)="androidId.set(readAndroidId())"
            />
            @if (androidId(); as value) {
              <ValueRow label="Android ID" [value]="value" />
            }
            <ActionButton
              testID="application-install-referrer-button"
              title="Get install referrer"
              [color]="lineColor"
              (press)="getInstallReferrer()"
            />
            @if (installReferrer(); as value) {
              <ValueRow label="Install referrer" [value]="value" />
            }
          </view>
        }

        @if (isIos) {
          <view testID="application-ios-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">iOS</text>
            </view>
            <ActionButton
              testID="application-ios-vendor-id-button"
              title="Get vendor ID"
              [color]="lineColor"
              (press)="getIosVendorId()"
            />
            @if (iosVendorId(); as value) {
              <ValueRow label="Vendor ID" [value]="value" />
            }
            <ActionButton
              testID="application-ios-release-type-button"
              title="Get release type"
              [color]="lineColor"
              (press)="getIosReleaseType()"
            />
            @if (iosReleaseType(); as value) {
              <ValueRow label="Release type" [value]="value" />
            }
          </view>
        }
      </scroll-view>
    </safe-area-view>
  `,
})
export class ApplicationScreen {
  readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Application];
  readonly lineColor = LINE_COLOR.application;
  readonly badgeStyle = { backgroundColor: LINE_COLOR.application };
  readonly isAndroid = Platform.OS === ANDROID_OS;
  readonly isIos = Platform.OS === IOS_OS;
  readonly readAndroidId = getAndroidId;
  readonly scenarioSteps = [
    'Read the version, build and bundle id in the constants card',
    'Press the lookup buttons for install time and device-specific ids',
  ];

  readonly version = nativeApplicationVersion ?? UNKNOWN_LABEL;
  readonly build = nativeBuildVersion ?? UNKNOWN_LABEL;
  readonly name = applicationName ?? UNKNOWN_LABEL;
  readonly id = applicationId ?? UNKNOWN_LABEL;

  readonly installedAt = signal<string | null>(null);
  readonly androidId = signal<string | null>(null);
  readonly installReferrer = signal<string | null>(null);
  readonly iosVendorId = signal<string | null>(null);
  readonly iosReleaseType = signal<string | null>(null);

  getInstallationTime(): void {
    void getInstallationTimeAsync().then(value =>
      this.installedAt.set(value.toISOString()),
    );
  }

  getInstallReferrer(): void {
    void getInstallReferrerAsync().then(value =>
      this.installReferrer.set(value),
    );
  }

  getIosVendorId(): void {
    void getIosIdForVendorAsync().then(value =>
      this.iosVendorId.set(value ?? 'unavailable'),
    );
  }

  getIosReleaseType(): void {
    void getIosApplicationReleaseTypeAsync().then(value =>
      this.iosReleaseType.set(String(value)),
    );
  }
}
