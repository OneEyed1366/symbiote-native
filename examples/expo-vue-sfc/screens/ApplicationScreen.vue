<!--
  @symbiote-native/application tour stop — an eager-constants card (nativeApplicationVersion/
  nativeBuildVersion/applicationName/applicationId, resolved once at import time) plus an actions
  card: getInstallationTimeAsync() on both platforms, then a platform-gated pair (Android:
  getAndroidId/getInstallReferrerAsync; iOS: getIosIdForVendorAsync/
  getIosApplicationReleaseTypeAsync). Vue SFC twin of ../../react/screens/ApplicationScreen.tsx.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
import {
  ApplicationReleaseType,
  applicationId,
  applicationName,
  getAndroidId,
  getInstallReferrerAsync,
  getInstallationTimeAsync,
  getIosApplicationReleaseTypeAsync,
  getIosIdForVendorAsync,
  nativeApplicationVersion,
  nativeBuildVersion,
} from '@symbiote-native/application/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function applicationReleaseTypeLabel(type: ApplicationReleaseType): string {
  switch (type) {
    case ApplicationReleaseType.SIMULATOR:
      return 'Simulator';
    case ApplicationReleaseType.ENTERPRISE:
      return 'Enterprise';
    case ApplicationReleaseType.DEVELOPMENT:
      return 'Development';
    case ApplicationReleaseType.AD_HOC:
      return 'Ad Hoc';
    case ApplicationReleaseType.APP_STORE:
      return 'App Store';
    default:
      return 'Unknown';
  }
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Application];
const lineColor = LINE_COLOR[lineInfo.line];

const installationTimeResult = ref<string | null>(null);
const androidIdResult = ref<string | null>(null);
const installReferrerResult = ref<string | null>(null);
const iosVendorIdResult = ref<string | null>(null);
const iosReleaseTypeResult = ref<string | null>(null);

function handleGetInstallationTime(): void {
  void getInstallationTimeAsync().then(value => {
    installationTimeResult.value = value.toISOString();
  });
}

function handleGetAndroidId(): void {
  androidIdResult.value = getAndroidId();
}

function handleGetInstallReferrer(): void {
  void getInstallReferrerAsync().then(value => {
    installReferrerResult.value = value;
  });
}

function handleGetIosIdForVendor(): void {
  void getIosIdForVendorAsync().then(value => {
    iosVendorIdResult.value = value;
  });
}

function handleGetIosReleaseType(): void {
  void getIosApplicationReleaseTypeAsync().then(value => {
    iosReleaseTypeResult.value = applicationReleaseTypeLabel(value);
  });
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="application-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Application</text>
          <text class="hero-body"
            >@symbiote-native/application — app version/build/name/ID, install
            time, the Android ID and install referrer on Android, the vendor ID
            and release type on iOS.</text
          >
        </view>
      </view>

      <view testID="application-info-card" class="application-card">
        <text class="application-card-title">Info</text>
        <view class="application-row">
          <text class="application-row-label">Name</text>
          <text class="application-value-text">{{
            applicationName ?? 'unknown'
          }}</text>
        </view>
        <view class="application-row">
          <text class="application-row-label">ID</text>
          <text class="application-value-text">{{
            applicationId ?? 'unknown'
          }}</text>
        </view>
        <view class="application-row">
          <text class="application-row-label">Version</text>
          <text class="application-value-text">{{
            nativeApplicationVersion ?? 'unknown'
          }}</text>
        </view>
        <view class="application-row">
          <text class="application-row-label">Build</text>
          <text class="application-value-text">{{
            nativeBuildVersion ?? 'unknown'
          }}</text>
        </view>
      </view>

      <view testID="application-actions-card" class="application-card">
        <text class="application-card-title">Actions</text>
        <view class="button-row">
          <ActionButton
            testID="application-installation-time-button"
            title="Get Installation Time"
            :onPress="handleGetInstallationTime"
            :color="lineColor"
          />
        </view>
        <view v-if="installationTimeResult !== null" class="application-row">
          <text class="application-row-label">Installed</text>
          <text
            testID="application-installation-time-value"
            class="application-value-text"
            >{{ installationTimeResult }}</text
          >
        </view>

        <view v-if="Platform.OS === 'android'" class="button-row">
          <ActionButton
            testID="application-android-id-button"
            title="Get Android ID"
            :onPress="handleGetAndroidId"
            :color="lineColor"
          />
          <ActionButton
            testID="application-install-referrer-button"
            title="Get Install Referrer"
            :onPress="handleGetInstallReferrer"
            :color="lineColor"
          />
        </view>
        <view v-if="androidIdResult !== null" class="application-row">
          <text class="application-row-label">Android ID</text>
          <text
            testID="application-android-id-value"
            class="application-value-text"
            >{{ androidIdResult }}</text
          >
        </view>
        <view v-if="installReferrerResult !== null" class="application-row">
          <text class="application-row-label">Install referrer</text>
          <text
            testID="application-install-referrer-value"
            class="application-value-text"
            >{{ installReferrerResult }}</text
          >
        </view>

        <view v-if="Platform.OS === 'ios'" class="button-row">
          <ActionButton
            testID="application-ios-vendor-id-button"
            title="Get iOS ID For Vendor"
            :onPress="handleGetIosIdForVendor"
            :color="lineColor"
          />
          <ActionButton
            testID="application-ios-release-type-button"
            title="Get iOS Release Type"
            :onPress="handleGetIosReleaseType"
            :color="lineColor"
          />
        </view>
        <view v-if="iosVendorIdResult !== null" class="application-row">
          <text class="application-row-label">iOS vendor ID</text>
          <text
            testID="application-ios-vendor-id-value"
            class="application-value-text"
            >{{ iosVendorIdResult }}</text
          >
        </view>
        <view v-if="iosReleaseTypeResult !== null" class="application-row">
          <text class="application-row-label">iOS release type</text>
          <text
            testID="application-ios-release-type-value"
            class="application-value-text"
            >{{ iosReleaseTypeResult }}</text
          >
        </view>
      </view>
    </scroll-view>
  </safe-area-view>
</template>
