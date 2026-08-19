import { createSignal, onCleanup } from 'solid-js';
import { Platform, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/solid';
import {
  BatteryState,
  isAvailableAsync,
  isBatteryOptimizationEnabledAsync,
} from '@symbiote-native/battery';
import {
  createBatteryLevel,
  createBatteryState,
  createLowPowerMode,
} from '@symbiote-native/battery/solid';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function CapabilityBadge(props: { status: ICapabilityStatus }) {
  const label = () =>
    props.status === 'checking' ? 'CHECKING…' : props.status === 'yes' ? 'YES' : 'NO';
  return (
    <View class={`status-badge status-badge-${props.status}`}>
      <Text class="status-badge-text">{label()}</Text>
    </View>
  );
}

function CapabilityRow(props: {
  testID: string;
  label: string;
  status: ICapabilityStatus;
}) {
  return (
    <View testID={props.testID} class="capability-row">
      <Text class="capability-label">{props.label}</Text>
      <CapabilityBadge status={props.status} />
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
 * subscription-backed primitives (createBatteryLevel, createBatteryState, createLowPowerMode)
 * plus a capabilities card for the two one-shot checks (isAvailableAsync - every platform,
 * isBatteryOptimizationEnabledAsync - Android only upstream). iOS Simulators report the battery
 * API as unavailable; a real device is needed to see live readings.
 */
export function BatteryScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Battery];
  const lineColor = LINE_COLOR[lineInfo.line];

  const batteryLevel = createBatteryLevel();
  const batteryState = createBatteryState();
  const lowPowerMode = createLowPowerMode();

  const [isAvailable, setIsAvailable] = createSignal<ICapabilityStatus>('checking');
  const [isBatteryOptimizationEnabled, setIsBatteryOptimizationEnabled] =
    createSignal<ICapabilityStatus>('checking');

  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  isAvailableAsync().then(value => {
    if (!disposed) {
      setIsAvailable(toCapabilityStatus(value));
    }
  });
  if (Platform.OS === 'android') {
    isBatteryOptimizationEnabledAsync().then(value => {
      if (!disposed) {
        setIsBatteryOptimizationEnabled(toCapabilityStatus(value));
      }
    });
  }

  const batteryLevelLabel = () =>
    batteryLevel() < 0 ? 'unknown' : `${Math.round(batteryLevel() * 100)}%`;

  return (
    <SafeAreaView class="screen">
      <ScrollView
        testID="battery-scroll"
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
            <Text class="hero-title">Battery</Text>
            <Text class="hero-body">
              @symbiote-native/battery — live battery level, charging state, and
              low-power mode via three subscription-backed primitives. A
              simulator reports the battery API as unavailable; a real device
              is needed to see live readings.
            </Text>
          </View>
        </View>

        <View testID="battery-live-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Live status</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Battery level</Text>
            <Text class="value-text">{batteryLevelLabel()}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Battery state</Text>
            <Text class="value-text">
              {batteryStateLabel(batteryState())}
            </Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Low power mode</Text>
            <Text class="value-text">{lowPowerMode() ? 'On' : 'Off'}</Text>
          </View>
        </View>

        <View testID="battery-capabilities-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Capabilities</Text>
          </View>
          <CapabilityRow
            testID="battery-available"
            label="Available"
            status={isAvailable()}
          />
          {Platform.OS === 'android' && (
            <CapabilityRow
              testID="battery-optimization"
              label="Battery optimization enabled"
              status={isBatteryOptimizationEnabled()}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
