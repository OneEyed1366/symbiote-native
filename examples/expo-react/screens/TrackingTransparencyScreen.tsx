import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/react';
import { getAdvertisingId, usePermissions } from '@symbiote-native/tracking-transparency/react';
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
 * @symbiote-native/tracking-transparency canary demo: usePermissions() auto-fetches status on
 * mount and exposes get/request as imperative callbacks; getAdvertisingId() is a plain sync
 * call fetched once on mount, expected to read null on Android/the iOS simulator.
 */
export function TrackingTransparencyScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TrackingTransparency];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [status, requestPermission, getPermission] = usePermissions();
  const [advertisingId, setAdvertisingId] = useState<string | null>(null);

  useEffect(() => {
    setAdvertisingId(getAdvertisingId());
  }, []);

  return (
    <SafeAreaView className="screen">
      <ScrollView testID="tracking-transparency-scroll" className="screen" contentContainerStyle="scroll-content">
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text className="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Tracking Transparency</Text>
            <Text className="hero-body">
              @symbiote-native/tracking-transparency — the iOS App Tracking Transparency prompt
              (always granted on Android) plus the advertising-ID getter.
            </Text>
          </View>
        </View>

        <View testID="tracking-transparency-permission-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Permission</Text>
          </View>
          <ValueRow label="Status" value={status === null ? 'checking…' : status.status} />
          <ValueRow label="Granted" value={status === null ? 'checking…' : status.granted ? 'Yes' : 'No'} />
          <ActionButton
            testID="tracking-transparency-get-button"
            title="Get"
            onPress={() => getPermission()}
            color={lineColor}
          />
          <ActionButton
            testID="tracking-transparency-request-button"
            title="Request"
            onPress={() => requestPermission()}
            color={lineColor}
          />
        </View>

        <View testID="tracking-transparency-advertising-id-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Advertising ID</Text>
          </View>
          <ValueRow label="Advertising ID" value={advertisingId ?? 'null'} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
