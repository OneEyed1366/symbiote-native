import { createSignal, onCleanup } from 'solid-js';
import { Platform, ScrollView } from '@symbiote-native/solid';
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
    props.status === 'checking'
      ? 'CHECKING…'
      : props.status === 'yes'
        ? 'YES'
        : 'NO';
  return (
    <view class={`status-badge status-badge-${props.status}`}>
      <text class="status-badge-text">{label()}</text>
    </view>
  );
}

function CapabilityRow(props: {
  testID: string;
  label: string;
  status: ICapabilityStatus;
}) {
  return (
    <view testID={props.testID} class="capability-row">
      <text class="capability-label">{props.label}</text>
      <CapabilityBadge status={props.status} />
    </view>
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

  const [isAvailable, setIsAvailable] =
    createSignal<ICapabilityStatus>('checking');
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
    <safe-area-view class="screen">
      <ScrollView
        testID="battery-scroll"
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
            <text class="hero-title">Battery</text>
            <text class="hero-body">
              @symbiote-native/battery — live battery level, charging state, and
              low-power mode via three subscription-backed primitives. A
              simulator reports the battery API as unavailable; a real device is
              needed to see live readings.
            </text>
          </view>
        </view>

        <view testID="battery-live-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Live status</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Battery level</text>
            <text class="value-text">{batteryLevelLabel()}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Battery state</text>
            <text class="value-text">{batteryStateLabel(batteryState())}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Low power mode</text>
            <text class="value-text">{lowPowerMode() ? 'On' : 'Off'}</text>
          </view>
        </view>

        <view testID="battery-capabilities-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Capabilities</text>
          </view>
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
        </view>
      </ScrollView>
    </safe-area-view>
  );
}
