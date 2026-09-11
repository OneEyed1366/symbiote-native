<script lang="ts">
  // @symbiote-native/application tour stop — an eager-constants card (nativeApplicationVersion/
  // nativeBuildVersion/applicationName/applicationId, resolved once at import time) plus an actions
  // card: getInstallationTimeAsync() on both platforms, then a platform-gated pair (Android:
  // getAndroidId/getInstallReferrerAsync; iOS: getIosIdForVendorAsync/
  // getIosApplicationReleaseTypeAsync). Svelte twin of
  // examples/expo-vue-sfc/screens/ApplicationScreen.vue.
  import { Platform, ScrollView } from '@symbiote-native/svelte';
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
  } from '@symbiote-native/application/svelte';
  import ActionButton from '../components/ActionButton.svelte';
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

  let installationTimeResult = $state<string | null>(null);
  let androidIdResult = $state<string | null>(null);
  let installReferrerResult = $state<string | null>(null);
  let iosVendorIdResult = $state<string | null>(null);
  let iosReleaseTypeResult = $state<string | null>(null);

  function handleGetInstallationTime(): void {
    void getInstallationTimeAsync().then(value => {
      installationTimeResult = value.toISOString();
    });
  }

  function handleGetAndroidId(): void {
    androidIdResult = getAndroidId();
  }

  function handleGetInstallReferrer(): void {
    void getInstallReferrerAsync().then(value => {
      installReferrerResult = value;
    });
  }

  function handleGetIosIdForVendor(): void {
    void getIosIdForVendorAsync().then(value => {
      iosVendorIdResult = value;
    });
  }

  function handleGetIosReleaseType(): void {
    void getIosApplicationReleaseTypeAsync().then(value => {
      iosReleaseTypeResult = applicationReleaseTypeLabel(value);
    });
  }
</script>

<safe-area-view class="screen">
  <ScrollView
    testID="application-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: lineColor }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">Application</text>
        <text class="hero-body">
          @symbiote-native/application — app version/build/name/ID, install
          time, the Android ID and install referrer on Android, the vendor ID
          and release type on iOS.
        </text>
      </view>
    </view>
    <view testID="application-info-card" class="application-card">
      <text class="application-card-title">Info</text>
      <view class="application-row">
        <text class="application-row-label">Name</text>
        <text class="application-value-text">
          {applicationName ?? 'unknown'}
        </text>
      </view>
      <view class="application-row">
        <text class="application-row-label">ID</text>
        <text class="application-value-text">{applicationId ?? 'unknown'}</text>
      </view>
      <view class="application-row">
        <text class="application-row-label">Version</text>
        <text class="application-value-text">
          {nativeApplicationVersion ?? 'unknown'}
        </text>
      </view>
      <view class="application-row">
        <text class="application-row-label">Build</text>
        <text class="application-value-text">
          {nativeBuildVersion ?? 'unknown'}
        </text>
      </view>
    </view>
    <view testID="application-actions-card" class="application-card">
      <text class="application-card-title">Actions</text>
      <view class="button-row">
        <ActionButton
          testID="application-installation-time-button"
          title="Get Installation Time"
          onPress={handleGetInstallationTime}
          color={lineColor}
        />
      </view>
      {#if installationTimeResult !== null}<view class="application-row">
          <text class="application-row-label">Installed</text>
          <text
            testID="application-installation-time-value"
            class="application-value-text"
          >
            {installationTimeResult}
          </text>
        </view>{/if}{#if Platform.OS === 'android'}<view class="button-row">
          <ActionButton
            testID="application-android-id-button"
            title="Get Android ID"
            onPress={handleGetAndroidId}
            color={lineColor}
          />
          <ActionButton
            testID="application-install-referrer-button"
            title="Get Install Referrer"
            onPress={handleGetInstallReferrer}
            color={lineColor}
          />
        </view>{/if}{#if androidIdResult !== null}<view class="application-row">
          <text class="application-row-label">Android ID</text>
          <text
            testID="application-android-id-value"
            class="application-value-text"
          >
            {androidIdResult}
          </text>
        </view>{/if}{#if installReferrerResult !== null}<view
          class="application-row"
        >
          <text class="application-row-label">Install referrer</text>
          <text
            testID="application-install-referrer-value"
            class="application-value-text"
          >
            {installReferrerResult}
          </text>
        </view>{/if}{#if Platform.OS === 'ios'}<view class="button-row">
          <ActionButton
            testID="application-ios-vendor-id-button"
            title="Get iOS ID For Vendor"
            onPress={handleGetIosIdForVendor}
            color={lineColor}
          />
          <ActionButton
            testID="application-ios-release-type-button"
            title="Get iOS Release Type"
            onPress={handleGetIosReleaseType}
            color={lineColor}
          />
        </view>{/if}{#if iosVendorIdResult !== null}<view
          class="application-row"
        >
          <text class="application-row-label">iOS vendor ID</text>
          <text
            testID="application-ios-vendor-id-value"
            class="application-value-text"
          >
            {iosVendorIdResult}
          </text>
        </view>{/if}{#if iosReleaseTypeResult !== null}<view
          class="application-row"
        >
          <text class="application-row-label">iOS release type</text>
          <text
            testID="application-ios-release-type-value"
            class="application-value-text"
          >
            {iosReleaseTypeResult}
          </text>
        </view>{/if}
    </view>
  </ScrollView>
</safe-area-view>
