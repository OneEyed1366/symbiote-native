<script lang="ts">
  import { Platform } from '@symbiote-native/svelte';
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
  } from '@symbiote-native/application/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Application];
  const lineColor = LINE_COLOR[lineInfo.line];

  let installedAt = $state<string | null>(null);
  let androidId = $state<string | null>(null);
  let installReferrer = $state<string | null>(null);
  let iosVendorId = $state<string | null>(null);
  let iosReleaseType = $state<string | null>(null);

  function handleGetInstallationTime(): void {
    void getInstallationTimeAsync().then(value => {
      installedAt = value.toISOString();
    });
  }

  function handleGetAndroidId(): void {
    androidId = getAndroidId();
  }

  function handleGetInstallReferrer(): void {
    void getInstallReferrerAsync().then(value => {
      installReferrer = value;
    });
  }

  function handleGetIosVendorId(): void {
    void getIosIdForVendorAsync().then(value => {
      iosVendorId = value ?? 'unavailable';
    });
  }

  function handleGetIosReleaseType(): void {
    void getIosApplicationReleaseTypeAsync().then(value => {
      iosReleaseType = String(value);
    });
  }
</script>

{#snippet valueRow(label: string, value: string)}
  <view class="capability-row">
    <text class="capability-label">{label}</text>
    <text class="value-text">{value}</text>
  </view>
{/snippet}

<safe-area-view class="screen">
  <scroll-view
    testID="application-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: lineColor }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
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
      steps={[
        'Read the version, build and bundle id in the constants card',
        'Press the lookup buttons for install time and device-specific ids',
      ]}
      expect="The values match the installed build (check Settings, General, iPhone Storage on iOS). Lookups that do not exist on this platform show as unavailable."
    />

    <view testID="application-constants-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Constants</text>
      </view>
      {@render valueRow('Version', nativeApplicationVersion ?? 'unknown')}
      {@render valueRow('Build', nativeBuildVersion ?? 'unknown')}
      {@render valueRow('Name', applicationName ?? 'unknown')}
      {@render valueRow('ID', applicationId ?? 'unknown')}
    </view>

    <view testID="application-install-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Install time</text>
      </view>
      <ActionButton
        testID="application-installation-time-button"
        title="Get installation time"
        onPress={handleGetInstallationTime}
        color={lineColor}
      />
      {#if installedAt !== null}
        {@render valueRow('Installed at', installedAt)}
      {/if}
    </view>

    {#if Platform.OS === 'android'}
      <view testID="application-android-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Android</text>
        </view>
        <ActionButton
          testID="application-android-id-button"
          title="Get Android ID"
          onPress={handleGetAndroidId}
          color={lineColor}
        />
        {#if androidId !== null}
          {@render valueRow('Android ID', androidId)}
        {/if}
        <ActionButton
          testID="application-install-referrer-button"
          title="Get install referrer"
          onPress={handleGetInstallReferrer}
          color={lineColor}
        />
        {#if installReferrer !== null}
          {@render valueRow('Install referrer', installReferrer)}
        {/if}
      </view>
    {/if}

    {#if Platform.OS === 'ios'}
      <view testID="application-ios-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">iOS</text>
        </view>
        <ActionButton
          testID="application-ios-vendor-id-button"
          title="Get vendor ID"
          onPress={handleGetIosVendorId}
          color={lineColor}
        />
        {#if iosVendorId !== null}
          {@render valueRow('Vendor ID', iosVendorId)}
        {/if}
        <ActionButton
          testID="application-ios-release-type-button"
          title="Get release type"
          onPress={handleGetIosReleaseType}
          color={lineColor}
        />
        {#if iosReleaseType !== null}
          {@render valueRow('Release type', iosReleaseType)}
        {/if}
      </view>
    {/if}
  </scroll-view>
</safe-area-view>
