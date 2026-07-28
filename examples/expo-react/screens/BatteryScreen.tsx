import { useEffect, useState } from 'react';
import { Platform, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/react';
import { BatteryState, isAvailableAsync, isBatteryOptimizationEnabledAsync } from '@symbiote-native/battery';
import { useBatteryLevel, useBatteryState, useLowPowerMode } from '@symbiote-native/battery/react';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function CapabilityBadge({ status }: { status: ICapabilityStatus }) {
  const label = status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
  return (
    <View className={`status-badge status-badge-${status}`}>
      <Text className="status-badge-text">{label}</Text>
    </View>
  );
}

function CapabilityRow({
  testID,
  label,
  status,
}: {
  testID: string;
  label: string;
  status: ICapabilityStatus;
}) {
  return (
    <View testID={testID} className="capability-row">
      <Text className="capability-label">{label}</Text>
      <CapabilityBadge status={status} />
    </View>
  );
}

function batteryStateLabel(state: BatteryState): string {
  switch (state) {
    case BatteryState.CHARGING:
      return 'Charging';
    case BatteryState.FULL:
      return 'Full';
    case BatteryState.UNPLUGGED:
      return 'Unplugged';
    case BatteryState.NOT_CHARGING:
      return 'Not charging (protecting battery)';
    case BatteryState.UNKNOWN:
    default:
      return 'Unknown';
  }
}

/**
 * @symbiote-native/battery canary demo: a live-status card driven by the three
 * subscription-backed hooks (useBatteryLevel, useBatteryState, useLowPowerMode) plus a
 * capabilities card for the two one-shot checks (isAvailableAsync — every platform,
 * isBatteryOptimizationEnabledAsync — Android only upstream). iOS Simulators report the battery
 * API as unavailable; a real device is needed to see live readings.
 */
export function BatteryScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Battery];
  const lineColor = LINE_COLOR[lineInfo.line];

  const batteryLevel = useBatteryLevel();
  const batteryState = useBatteryState();
  const lowPowerMode = useLowPowerMode();

  const [isAvailable, setIsAvailable] = useState<ICapabilityStatus>('checking');
  const [isBatteryOptimizationEnabled, setIsBatteryOptimizationEnabled] = useState<ICapabilityStatus>('checking');

  useEffect(() => {
    let isMounted = true;
    isAvailableAsync().then(value => {
      if (isMounted) {
        setIsAvailable(toCapabilityStatus(value));
      }
    });
    if (Platform.OS === 'android') {
      isBatteryOptimizationEnabledAsync().then(value => {
        if (isMounted) {
          setIsBatteryOptimizationEnabled(toCapabilityStatus(value));
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, []);

  const batteryLevelLabel = batteryLevel < 0 ? 'unknown' : `${Math.round(batteryLevel * 100)}%`;

  return (
    <SafeAreaView className="screen">
      <ScrollView testID="battery-scroll" className="screen" contentContainerStyle="scroll-content">
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text className="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Battery</Text>
            <Text className="hero-body">
              @symbiote-native/battery — live battery level, charging state, and low-power mode
              via three subscription-backed hooks. A simulator reports the battery API as
              unavailable; a real device is needed to see live readings.
            </Text>
          </View>
        </View>

        <View testID="battery-live-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Live status</Text>
          </View>
          <View className="capability-row">
            <Text className="capability-label">Battery level</Text>
            <Text className="value-text">{batteryLevelLabel}</Text>
          </View>
          <View className="capability-row">
            <Text className="capability-label">Battery state</Text>
            <Text className="value-text">{batteryStateLabel(batteryState)}</Text>
          </View>
          <View className="capability-row">
            <Text className="capability-label">Low power mode</Text>
            <Text className="value-text">{lowPowerMode ? 'On' : 'Off'}</Text>
          </View>
        </View>

        <View testID="battery-capabilities-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Capabilities</Text>
          </View>
          <CapabilityRow testID="battery-available" label="Available" status={isAvailable} />
          {Platform.OS === 'android' && (
            <CapabilityRow
              testID="battery-optimization"
              label="Battery optimization enabled"
              status={isBatteryOptimizationEnabled}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
