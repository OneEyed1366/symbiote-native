import { Component, signal } from '@angular/core';
import {
  Platform,
  SafeAreaViewElement,
  ScrollViewElement,
  Text,
  View,
} from '@symbiote-native/angular';
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
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

/**
 * @symbiote-native/application canary demo: an app-identity card of eagerly-resolved constants
 * (version, build, name, id), an install-time lookup button, and a platform-gated section —
 * Android ID + install referrer on Android, vendor ID + release type on iOS. Every export here is
 * a plain function or constant off the core package — no service to inject(), same shape as
 * @symbiote-native/local-auth's plain-function surface. Angular twin of
 * ../../react/screens/ApplicationScreen.tsx.
 */
@Component({
  selector: 'ApplicationScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaViewElement, ScrollViewElement, Text, View],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="application-scroll"
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
            <text class="hero-title">Application</text>
            <text class="hero-body">
              @symbiote-native/application — app version/build/name/id, install
              time, and the Android ID / iOS vendor ID platform-specific
              lookups.
            </text>
          </view>
        </view>

        <view testID="application-info-card" class="capability-card">
          <text class="capability-card-title">App identity</text>
          <view class="capability-row">
            <text class="capability-label">Version</text>
            <text class="value-text">{{
              nativeApplicationVersion ?? 'unknown'
            }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Build</text>
            <text class="value-text">{{
              nativeBuildVersion ?? 'unknown'
            }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Name</text>
            <text class="value-text">{{ applicationName ?? 'unknown' }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Id</text>
            <text class="value-text">{{ applicationId ?? 'unknown' }}</text>
          </view>
        </view>

        <view testID="application-install-card" class="capability-card">
          <text class="capability-card-title">Install time</text>
          <ActionButton
            testID="application-installation-time-button"
            title="Get installation time"
            (press)="handleGetInstallationTime()"
            [color]="lineColor"
          ></ActionButton>
          <text
            testID="application-installation-time-result"
            class="value-text"
          >
            {{ installationTimeLabel() }}
          </text>
        </view>

        @if (Platform.OS === 'android') {
          <view testID="application-android-card" class="capability-card">
            <text class="capability-card-title">Android</text>
            <ActionButton
              testID="application-android-id-button"
              title="Get Android ID"
              (press)="handleGetAndroidId()"
              [color]="lineColor"
            ></ActionButton>
            <text testID="application-android-id-result" class="value-text">{{
              androidIdLabel()
            }}</text>

            <ActionButton
              testID="application-install-referrer-button"
              title="Get install referrer"
              (press)="handleGetInstallReferrer()"
              [color]="lineColor"
            ></ActionButton>
            <text
              testID="application-install-referrer-result"
              class="value-text"
            >
              {{ installReferrerLabel() }}
            </text>
          </view>
        }

        @if (Platform.OS === 'ios') {
          <view testID="application-ios-card" class="capability-card">
            <text class="capability-card-title">iOS</text>
            <ActionButton
              testID="application-vendor-id-button"
              title="Get vendor ID"
              (press)="handleGetIosIdForVendor()"
              [color]="lineColor"
            ></ActionButton>
            <text testID="application-vendor-id-result" class="value-text">{{
              vendorIdLabel()
            }}</text>

            <ActionButton
              testID="application-release-type-button"
              title="Get release type"
              (press)="handleGetIosApplicationReleaseType()"
              [color]="lineColor"
            ></ActionButton>
            <text testID="application-release-type-result" class="value-text">
              {{ releaseTypeLabel() }}
            </text>
          </view>
        }
      </scroll-view>
    </safe-area-view>
  `,
})
export class ApplicationScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Application];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly Platform = Platform;

  readonly nativeApplicationVersion = nativeApplicationVersion;
  readonly nativeBuildVersion = nativeBuildVersion;
  readonly applicationName = applicationName;
  readonly applicationId = applicationId;

  readonly installationTime = signal<Date | null>(null);
  readonly androidId = signal<string | null>(null);
  readonly installReferrer = signal<string | null>(null);
  readonly vendorId = signal<string | null>(null);
  readonly releaseType = signal<string | null>(null);

  handleGetInstallationTime(): void {
    getInstallationTimeAsync().then(value => this.installationTime.set(value));
  }

  handleGetAndroidId(): void {
    this.androidId.set(getAndroidId());
  }

  handleGetInstallReferrer(): void {
    getInstallReferrerAsync().then(value => this.installReferrer.set(value));
  }

  handleGetIosIdForVendor(): void {
    getIosIdForVendorAsync().then(value => this.vendorId.set(value));
  }

  handleGetIosApplicationReleaseType(): void {
    getIosApplicationReleaseTypeAsync().then(value =>
      this.releaseType.set(String(value)),
    );
  }

  installationTimeLabel(): string {
    const value = this.installationTime();
    return value === null ? 'not checked yet' : value.toISOString();
  }

  androidIdLabel(): string {
    return this.androidId() ?? 'not checked yet';
  }

  installReferrerLabel(): string {
    return this.installReferrer() ?? 'not checked yet';
  }

  vendorIdLabel(): string {
    return this.vendorId() ?? 'not checked yet';
  }

  releaseTypeLabel(): string {
    return this.releaseType() ?? 'not checked yet';
  }
}
