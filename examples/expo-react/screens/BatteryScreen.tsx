import { useEffect, useState } from 'react';
import { Platform } from '@symbiote-native/react';
import {
  BatteryState,
  isAvailableAsync,
  isBatteryOptimizationEnabledAsync,
} from '@symbiote-native/battery';
import {
  useBatteryLevel,
  useBatteryState,
  useLowPowerMode,
} from '@symbiote-native/battery/react';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function CapabilityBadge({ status }: { status: ICapabilityStatus }) {
  const label =
    status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
  return (
    <view className={`status-badge status-badge-${status}`}>
      <text className="status-badge-text">{label}</text>
    </view>
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
    <view testID={testID} className="capability-row">
      <text className="capability-label">{label}</text>
      <CapabilityBadge status={status} />
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
  const [isBatteryOptimizationEnabled, setIsBatteryOptimizationEnabled] =
    useState<ICapabilityStatus>('checking');

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

  const batteryLevelLabel =
    batteryLevel < 0 ? 'unknown' : `${Math.round(batteryLevel * 100)}%`;

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="battery-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view className="hero-card">
          <view className="hero-badge" style={{ backgroundColor: lineColor }}>
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Battery</text>
            <text className="hero-body">
              @symbiote-native/battery — live battery level, charging state, and
              low-power mode via three subscription-backed hooks. A simulator
              reports the battery API as unavailable; a real device is needed to
              see live readings.
            </text>
          </view>
        </view>

        <view testID="battery-live-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Live status</text>
          </view>
          <view className="capability-row">
            <text className="capability-label">Battery level</text>
            <text className="value-text">{batteryLevelLabel}</text>
          </view>
          <view className="capability-row">
            <text className="capability-label">Battery state</text>
            <text className="value-text">
              {batteryStateLabel(batteryState)}
            </text>
          </view>
          <view className="capability-row">
            <text className="capability-label">Low power mode</text>
            <text className="value-text">{lowPowerMode ? 'On' : 'Off'}</text>
          </view>
        </view>

        <view testID="battery-capabilities-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Capabilities</text>
          </view>
          <CapabilityRow
            testID="battery-available"
            label="Available"
            status={isAvailable}
          />
          {Platform.OS === 'android' && (
            <CapabilityRow
              testID="battery-optimization"
              label="Battery optimization enabled"
              status={isBatteryOptimizationEnabled}
            />
          )}
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
