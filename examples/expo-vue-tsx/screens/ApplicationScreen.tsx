import { defineComponent, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
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
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="capability-row">
      <text class="capability-label">{props.label}</text>
      <text class="value-text">{props.value}</text>
    </view>
  );
}

export const ApplicationScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Application];
    const lineColor = LINE_COLOR[lineInfo.line];

    const installedAt: Ref<string | null> = ref(null);
    const androidId: Ref<string | null> = ref(null);
    const installReferrer: Ref<string | null> = ref(null);
    const iosVendorId: Ref<string | null> = ref(null);
    const iosReleaseType: Ref<string | null> = ref(null);

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });

    function handleGetInstallationTime() {
      getInstallationTimeAsync().then(value => {
        if (isMounted) installedAt.value = value.toISOString();
      });
    }

    function handleGetAndroidId() {
      androidId.value = getAndroidId();
    }

    function handleGetInstallReferrer() {
      getInstallReferrerAsync().then(value => {
        if (isMounted) installReferrer.value = value;
      });
    }

    function handleGetIosVendorId() {
      getIosIdForVendorAsync().then(value => {
        if (isMounted) iosVendorId.value = value ?? 'unavailable';
      });
    }

    function handleGetIosReleaseType() {
      getIosApplicationReleaseTypeAsync().then(value => {
        if (isMounted) iosReleaseType.value = String(value);
      });
    }

    return () => (
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
                bundle id, install date and store metadata. Use it for the
                About screen, support emails and crash reports.
              </text>
            </view>
          </view>

          <Scenario
            testID="application-scenario"
            title="Show the exact app version in About and support emails"
            why="Support needs to know precisely which build a user runs. The version and build number come from the native bundle, so they always match the installed binary."
            steps={['Read the version, build and bundle id in the constants card', 'Press the lookup buttons for install time and device-specific ids']}
            expect="The values match the installed build (check Settings, General, iPhone Storage on iOS). Lookups that do not exist on this platform show as unavailable."
          />

          <view testID="application-constants-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Constants</text>
            </view>
            <ValueRow
              label="Version"
              value={nativeApplicationVersion ?? 'unknown'}
            />
            <ValueRow label="Build" value={nativeBuildVersion ?? 'unknown'} />
            <ValueRow label="Name" value={applicationName ?? 'unknown'} />
            <ValueRow label="ID" value={applicationId ?? 'unknown'} />
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
            {installedAt.value !== null && (
              <ValueRow label="Installed at" value={installedAt.value} />
            )}
          </view>

          {Platform.OS === 'android' && (
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
              {androidId.value !== null && (
                <ValueRow label="Android ID" value={androidId.value} />
              )}
              <ActionButton
                testID="application-install-referrer-button"
                title="Get install referrer"
                onPress={handleGetInstallReferrer}
                color={lineColor}
              />
              {installReferrer.value !== null && (
                <ValueRow label="Install referrer" value={installReferrer.value} />
              )}
            </view>
          )}

          {Platform.OS === 'ios' && (
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
              {iosVendorId.value !== null && (
                <ValueRow label="Vendor ID" value={iosVendorId.value} />
              )}
              <ActionButton
                testID="application-ios-release-type-button"
                title="Get release type"
                onPress={handleGetIosReleaseType}
                color={lineColor}
              />
              {iosReleaseType.value !== null && (
                <ValueRow label="Release type" value={iosReleaseType.value} />
              )}
            </view>
          )}
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'ApplicationScreen' },
);
