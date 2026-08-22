import { Component, signal } from '@angular/core';
import {
  Platform,
  SafeAreaView,
  ScrollView,
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
  imports: [ActionButton, SafeAreaView, ScrollView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView
        testID="application-scroll"
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
            <Text class="hero-title">Application</Text>
            <Text class="hero-body">
              @symbiote-native/application — app version/build/name/id, install
              time, and the Android ID / iOS vendor ID platform-specific
              lookups.
            </Text>
          </View>
        </View>

        <View testID="application-info-card" class="capability-card">
          <Text class="capability-card-title">App identity</Text>
          <View class="capability-row">
            <Text class="capability-label">Version</Text>
            <Text class="value-text">{{
              nativeApplicationVersion ?? 'unknown'
            }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Build</Text>
            <Text class="value-text">{{
              nativeBuildVersion ?? 'unknown'
            }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Name</Text>
            <Text class="value-text">{{ applicationName ?? 'unknown' }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Id</Text>
            <Text class="value-text">{{ applicationId ?? 'unknown' }}</Text>
          </View>
        </View>

        <View testID="application-install-card" class="capability-card">
          <Text class="capability-card-title">Install time</Text>
          <ActionButton
            testID="application-installation-time-button"
            title="Get installation time"
            (press)="handleGetInstallationTime()"
            [color]="lineColor"
          ></ActionButton>
          <Text
            testID="application-installation-time-result"
            class="value-text"
          >
            {{ installationTimeLabel() }}
          </Text>
        </View>

        @if (Platform.OS === 'android') {
          <View testID="application-android-card" class="capability-card">
            <Text class="capability-card-title">Android</Text>
            <ActionButton
              testID="application-android-id-button"
              title="Get Android ID"
              (press)="handleGetAndroidId()"
              [color]="lineColor"
            ></ActionButton>
            <Text testID="application-android-id-result" class="value-text">{{
              androidIdLabel()
            }}</Text>

            <ActionButton
              testID="application-install-referrer-button"
              title="Get install referrer"
              (press)="handleGetInstallReferrer()"
              [color]="lineColor"
            ></ActionButton>
            <Text
              testID="application-install-referrer-result"
              class="value-text"
            >
              {{ installReferrerLabel() }}
            </Text>
          </View>
        }

        @if (Platform.OS === 'ios') {
          <View testID="application-ios-card" class="capability-card">
            <Text class="capability-card-title">iOS</Text>
            <ActionButton
              testID="application-vendor-id-button"
              title="Get vendor ID"
              (press)="handleGetIosIdForVendor()"
              [color]="lineColor"
            ></ActionButton>
            <Text testID="application-vendor-id-result" class="value-text">{{
              vendorIdLabel()
            }}</Text>

            <ActionButton
              testID="application-release-type-button"
              title="Get release type"
              (press)="handleGetIosApplicationReleaseType()"
              [color]="lineColor"
            ></ActionButton>
            <Text testID="application-release-type-result" class="value-text">
              {{ releaseTypeLabel() }}
            </Text>
          </View>
        }
      </ScrollView>
    </SafeAreaView>
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
