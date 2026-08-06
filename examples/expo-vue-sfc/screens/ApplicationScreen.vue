<!--
  @symbiote-native/application tour stop — an eager-constants card (nativeApplicationVersion/
  nativeBuildVersion/applicationName/applicationId, resolved once at import time) plus an actions
  card: getInstallationTimeAsync() on both platforms, then a platform-gated pair (Android:
  getAndroidId/getInstallReferrerAsync; iOS: getIosIdForVendorAsync/
  getIosApplicationReleaseTypeAsync). Vue SFC twin of ../../react/screens/ApplicationScreen.tsx.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { Platform, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
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
  <SafeAreaView class="screen">
    <ScrollView testID="application-scroll" class="screen" content-container-style="scroll-content">
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" :style="{ backgroundColor: lineColor }">
          <Text class="hero-badge-text">{{ lineInfo.code }}</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">Application</Text>
          <Text class="hero-body"
            >@symbiote-native/application — app version/build/name/ID, install time, the Android
            ID and install referrer on Android, the vendor ID and release type on iOS.</Text
          >
        </View>
      </View>

      <View testID="application-info-card" class="application-card">
        <Text class="application-card-title">Info</Text>
        <View class="application-row">
          <Text class="application-row-label">Name</Text>
          <Text class="application-value-text">{{ applicationName ?? 'unknown' }}</Text>
        </View>
        <View class="application-row">
          <Text class="application-row-label">ID</Text>
          <Text class="application-value-text">{{ applicationId ?? 'unknown' }}</Text>
        </View>
        <View class="application-row">
          <Text class="application-row-label">Version</Text>
          <Text class="application-value-text">{{ nativeApplicationVersion ?? 'unknown' }}</Text>
        </View>
        <View class="application-row">
          <Text class="application-row-label">Build</Text>
          <Text class="application-value-text">{{ nativeBuildVersion ?? 'unknown' }}</Text>
        </View>
      </View>

      <View testID="application-actions-card" class="application-card">
        <Text class="application-card-title">Actions</Text>
        <View class="button-row">
          <ActionButton
            testID="application-installation-time-button"
            title="Get Installation Time"
            :onPress="handleGetInstallationTime"
            :color="lineColor"
          />
        </View>
        <View v-if="installationTimeResult !== null" class="application-row">
          <Text class="application-row-label">Installed</Text>
          <Text testID="application-installation-time-value" class="application-value-text">{{ installationTimeResult }}</Text>
        </View>

        <View v-if="Platform.OS === 'android'" class="button-row">
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
        </View>
        <View v-if="androidIdResult !== null" class="application-row">
          <Text class="application-row-label">Android ID</Text>
          <Text testID="application-android-id-value" class="application-value-text">{{ androidIdResult }}</Text>
        </View>
        <View v-if="installReferrerResult !== null" class="application-row">
          <Text class="application-row-label">Install referrer</Text>
          <Text testID="application-install-referrer-value" class="application-value-text">{{ installReferrerResult }}</Text>
        </View>

        <View v-if="Platform.OS === 'ios'" class="button-row">
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
        </View>
        <View v-if="iosVendorIdResult !== null" class="application-row">
          <Text class="application-row-label">iOS vendor ID</Text>
          <Text testID="application-ios-vendor-id-value" class="application-value-text">{{ iosVendorIdResult }}</Text>
        </View>
        <View v-if="iosReleaseTypeResult !== null" class="application-row">
          <Text class="application-row-label">iOS release type</Text>
          <Text testID="application-ios-release-type-value" class="application-value-text">{{ iosReleaseTypeResult }}</Text>
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
