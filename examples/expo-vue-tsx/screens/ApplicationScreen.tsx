import { defineComponent, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from '@symbiote-native/vue';
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
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function releaseTypeLabel(type: ApplicationReleaseType): string {
  switch (type) {
    case ApplicationReleaseType.SIMULATOR:
      return 'Simulator';
    case ApplicationReleaseType.ENTERPRISE:
      return 'Enterprise';
    case ApplicationReleaseType.DEVELOPMENT:
      return 'Development';
    case ApplicationReleaseType.AD_HOC:
      return 'Ad hoc';
    case ApplicationReleaseType.APP_STORE:
      return 'App Store';
    case ApplicationReleaseType.UNKNOWN:
    default:
      return 'Unknown';
  }
}

function ValueRow(props: { label: string; value: string }) {
  return (
    <View class="auth-capability-row">
      <Text class="auth-capability-label">{props.label}</Text>
      <Text class="auth-value-text">{props.value}</Text>
    </View>
  );
}

/**
 * Application demo: @symbiote-native/application — the four version/name/ID constants render
 * directly (eager, module-level), getInstallationTimeAsync() is a shared cross-platform async
 * check, and the remaining functions are platform-exclusive upstream (Android: Android ID +
 * install referrer; iOS: vendor ID + release type), gated the same way LocalAuthScreen gates its
 * Android-only cancel button. Vue TSX twin of ../../expo-react/screens/ApplicationScreen.tsx.
 */
export const ApplicationScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Application];
    const lineColor = LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.Application].line];

    const installationTime: Ref<string | null> = ref(null);
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
        if (isMounted) installationTime.value = value.toISOString();
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
        if (isMounted) iosVendorId.value = value ?? '(none)';
      });
    }

    function handleGetIosReleaseType() {
      getIosApplicationReleaseTypeAsync().then(value => {
        if (isMounted) iosReleaseType.value = releaseTypeLabel(value);
      });
    }

    return () => (
      <SafeAreaView class="screen">
        <ScrollView
          testID="application-scroll"
          class="screen"
          contentContainerStyle="scroll-content"
        >
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: lineColor }}>
              <Text class="hero-badge-text">{lineInfo.code}</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">Application</Text>
              <Text class="hero-body">
                @symbiote-native/application — app version/build/name/ID,
                install-time lookups, plus the Android ID/install-referrer and
                iOS vendor-ID/release-type functions, each gated to the platform
                that supports it.
              </Text>
            </View>
          </View>

          <View testID="application-info-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">App info</Text>
            </View>
            <ValueRow
              label="Native app version"
              value={nativeApplicationVersion ?? 'unknown'}
            />
            <ValueRow
              label="Native build version"
              value={nativeBuildVersion ?? 'unknown'}
            />
            <ValueRow
              label="Application name"
              value={applicationName ?? 'unknown'}
            />
            <ValueRow
              label="Application ID"
              value={applicationId ?? 'unknown'}
            />
          </View>

          <View testID="application-install-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Install time</Text>
            </View>
            <ActionButton
              testID="application-installation-time-button"
              title="Get installation time"
              onPress={handleGetInstallationTime}
              color={lineColor}
            />
            <ValueRow
              label="Installed at"
              value={installationTime.value ?? 'checking…'}
            />
          </View>

          {Platform.OS === 'android' && (
            <View testID="application-android-card" class="auth-card">
              <View class="auth-card-header">
                <Text class="auth-card-title">Android</Text>
              </View>
              <ActionButton
                testID="application-android-id-button"
                title="Get Android ID"
                onPress={handleGetAndroidId}
                color={lineColor}
              />
              <ValueRow
                label="Android ID"
                value={androidId.value ?? 'checking…'}
              />
              <ActionButton
                testID="application-install-referrer-button"
                title="Get install referrer"
                onPress={handleGetInstallReferrer}
                color={lineColor}
              />
              <ValueRow
                label="Install referrer"
                value={installReferrer.value ?? 'checking…'}
              />
            </View>
          )}

          {Platform.OS === 'ios' && (
            <View testID="application-ios-card" class="auth-card">
              <View class="auth-card-header">
                <Text class="auth-card-title">iOS</Text>
              </View>
              <ActionButton
                testID="application-ios-vendor-id-button"
                title="Get iOS vendor ID"
                onPress={handleGetIosVendorId}
                color={lineColor}
              />
              <ValueRow
                label="Vendor ID"
                value={iosVendorId.value ?? 'checking…'}
              />
              <ActionButton
                testID="application-ios-release-type-button"
                title="Get release type"
                onPress={handleGetIosReleaseType}
                color={lineColor}
              />
              <ValueRow
                label="Release type"
                value={iosReleaseType.value ?? 'checking…'}
              />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'ApplicationScreen' },
);
