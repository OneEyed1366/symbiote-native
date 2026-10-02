<script setup lang="ts">
import { ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
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
} from '@symbiote-native/application/vue';
import ActionButton from '../components/ActionButton.vue';
import Scenario from '../components/Scenario.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import ValueRow from './ValueRow.vue';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Application];
const lineColor = LINE_COLOR[lineInfo.line];

const installedAt = ref<string | null>(null);
const androidId = ref<string | null>(null);
const installReferrer = ref<string | null>(null);
const iosVendorId = ref<string | null>(null);
const iosReleaseType = ref<string | null>(null);

function handleGetInstallationTime(): void {
  void getInstallationTimeAsync().then(value => {
    installedAt.value = value.toISOString();
  });
}

function handleGetAndroidId(): void {
  androidId.value = getAndroidId();
}

function handleGetInstallReferrer(): void {
  void getInstallReferrerAsync().then(value => {
    installReferrer.value = value;
  });
}

function handleGetIosVendorId(): void {
  void getIosIdForVendorAsync().then(value => {
    iosVendorId.value = value ?? 'unavailable';
  });
}

function handleGetIosReleaseType(): void {
  void getIosApplicationReleaseTypeAsync().then(value => {
    iosReleaseType.value = String(value);
  });
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view testID="application-scroll" class="screen" contentContainerStyle="scroll-content">
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Application</text>
          <text class="hero-body">
            Read what the app knows about itself: version, build number, name, bundle id, install
            date and store metadata. Use it for the About screen, support emails and crash reports.
          </text>
        </view>
      </view>

      <Scenario
        testID="application-scenario"
        title="Show the exact app version in About and support emails"
        why="Support needs to know precisely which build a user runs. The version and build number come from the native bundle, so they always match the installed binary."
        :steps="[
          'Read the version, build and bundle id in the constants card',
          'Press the lookup buttons for install time and device-specific ids',
        ]"
        expect="The values match the installed build (check Settings, General, iPhone Storage on iOS). Lookups that do not exist on this platform show as unavailable."
      />

      <view testID="application-constants-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Constants</text>
        </view>
        <ValueRow label="Version" :value="nativeApplicationVersion ?? 'unknown'" />
        <ValueRow label="Build" :value="nativeBuildVersion ?? 'unknown'" />
        <ValueRow label="Name" :value="applicationName ?? 'unknown'" />
        <ValueRow label="ID" :value="applicationId ?? 'unknown'" />
      </view>

      <view testID="application-install-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Install time</text>
        </view>
        <ActionButton
          testID="application-installation-time-button"
          title="Get installation time"
          :onPress="handleGetInstallationTime"
          :color="lineColor"
        />
        <ValueRow v-if="installedAt !== null" label="Installed at" :value="installedAt" />
      </view>

      <view v-if="Platform.OS === 'android'" testID="application-android-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Android</text>
        </view>
        <ActionButton
          testID="application-android-id-button"
          title="Get Android ID"
          :onPress="handleGetAndroidId"
          :color="lineColor"
        />
        <ValueRow v-if="androidId !== null" label="Android ID" :value="androidId" />
        <ActionButton
          testID="application-install-referrer-button"
          title="Get install referrer"
          :onPress="handleGetInstallReferrer"
          :color="lineColor"
        />
        <ValueRow
          v-if="installReferrer !== null"
          label="Install referrer"
          :value="installReferrer"
        />
      </view>

      <view v-if="Platform.OS === 'ios'" testID="application-ios-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">iOS</text>
        </view>
        <ActionButton
          testID="application-ios-vendor-id-button"
          title="Get vendor ID"
          :onPress="handleGetIosVendorId"
          :color="lineColor"
        />
        <ValueRow v-if="iosVendorId !== null" label="Vendor ID" :value="iosVendorId" />
        <ActionButton
          testID="application-ios-release-type-button"
          title="Get release type"
          :onPress="handleGetIosReleaseType"
          :color="lineColor"
        />
        <ValueRow v-if="iosReleaseType !== null" label="Release type" :value="iosReleaseType" />
      </view>
    </scroll-view>
  </safe-area-view>
</template>
