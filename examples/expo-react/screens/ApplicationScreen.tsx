import { useCallback, useState } from 'react';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from '@symbiote-native/react';
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
} from '@symbiote-native/application';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="capability-row">
      <Text className="capability-label">{label}</Text>
      <Text className="value-text">{value}</Text>
    </View>
  );
}

/**
 * @symbiote-native/application canary demo: a constants card (version/build/name/ID — all
 * resolved eagerly at import time) plus platform-gated one-shot async calls: Android ID +
 * install referrer on Android, vendor ID + release type on iOS.
 */
export function ApplicationScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Application];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [installedAt, setInstalledAt] = useState<string | null>(null);
  const [androidId, setAndroidId] = useState<string | null>(null);
  const [installReferrer, setInstallReferrer] = useState<string | null>(null);
  const [iosVendorId, setIosVendorId] = useState<string | null>(null);
  const [iosReleaseType, setIosReleaseType] = useState<string | null>(null);

  const handleGetInstallationTime = useCallback(() => {
    getInstallationTimeAsync().then(value => {
      setInstalledAt(value.toISOString());
    });
  }, []);

  const handleGetAndroidId = useCallback(() => {
    setAndroidId(getAndroidId());
  }, []);

  const handleGetInstallReferrer = useCallback(() => {
    getInstallReferrerAsync().then(setInstallReferrer);
  }, []);

  const handleGetIosVendorId = useCallback(() => {
    getIosIdForVendorAsync().then(value => {
      setIosVendorId(value ?? 'unavailable');
    });
  }, []);

  const handleGetIosReleaseType = useCallback(() => {
    getIosApplicationReleaseTypeAsync().then(value => {
      setIosReleaseType(String(value));
    });
  }, []);

  return (
    <SafeAreaView className="screen">
      <ScrollView
        testID="application-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text className="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Application</Text>
            <Text className="hero-body">
              @symbiote-native/application — native app version/build/name/ID
              constants, plus install-time, Android ID/install-referrer, and iOS
              vendor ID/release-type lookups.
            </Text>
          </View>
        </View>

        <View testID="application-constants-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Constants</Text>
          </View>
          <ValueRow
            label="Version"
            value={nativeApplicationVersion ?? 'unknown'}
          />
          <ValueRow label="Build" value={nativeBuildVersion ?? 'unknown'} />
          <ValueRow label="Name" value={applicationName ?? 'unknown'} />
          <ValueRow label="ID" value={applicationId ?? 'unknown'} />
        </View>

        <View testID="application-install-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Install time</Text>
          </View>
          <ActionButton
            testID="application-installation-time-button"
            title="Get installation time"
            onPress={handleGetInstallationTime}
            color={lineColor}
          />
          {installedAt !== null && (
            <ValueRow label="Installed at" value={installedAt} />
          )}
        </View>

        {Platform.OS === 'android' && (
          <View testID="application-android-card" className="feature-card">
            <View className="feature-card-header">
              <Text className="feature-card-title">Android</Text>
            </View>
            <ActionButton
              testID="application-android-id-button"
              title="Get Android ID"
              onPress={handleGetAndroidId}
              color={lineColor}
            />
            {androidId !== null && (
              <ValueRow label="Android ID" value={androidId} />
            )}
            <ActionButton
              testID="application-install-referrer-button"
              title="Get install referrer"
              onPress={handleGetInstallReferrer}
              color={lineColor}
            />
            {installReferrer !== null && (
              <ValueRow label="Install referrer" value={installReferrer} />
            )}
          </View>
        )}

        {Platform.OS === 'ios' && (
          <View testID="application-ios-card" className="feature-card">
            <View className="feature-card-header">
              <Text className="feature-card-title">iOS</Text>
            </View>
            <ActionButton
              testID="application-ios-vendor-id-button"
              title="Get vendor ID"
              onPress={handleGetIosVendorId}
              color={lineColor}
            />
            {iosVendorId !== null && (
              <ValueRow label="Vendor ID" value={iosVendorId} />
            )}
            <ActionButton
              testID="application-ios-release-type-button"
              title="Get release type"
              onPress={handleGetIosReleaseType}
              color={lineColor}
            />
            {iosReleaseType !== null && (
              <ValueRow label="Release type" value={iosReleaseType} />
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
