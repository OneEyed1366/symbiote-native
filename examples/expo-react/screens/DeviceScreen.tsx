import { useCallback, useState } from 'react';
import {
  DeviceType,
  brand,
  deviceName,
  deviceType,
  getDeviceTypeAsync,
  getUptimeAsync,
  isDevice,
  isRootedExperimentalAsync,
  manufacturer,
  modelName,
  osName,
  osVersion,
  totalMemory,
} from '@symbiote-native/device';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const BYTES_PER_UNIT = 1024;
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return 'unknown';
  }
  let value = bytes;
  let unitIndex = 0;
  while (value >= BYTES_PER_UNIT && unitIndex < SIZE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${SIZE_UNITS[unitIndex]}`;
}

function deviceTypeLabel(type: DeviceType | null): string {
  switch (type) {
    case DeviceType.PHONE:
      return 'Phone';
    case DeviceType.TABLET:
      return 'Tablet';
    case DeviceType.DESKTOP:
      return 'Desktop';
    case DeviceType.TV:
      return 'TV';
    case DeviceType.UNKNOWN:
    default:
      return 'Unknown';
  }
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <view className="capability-row">
      <text className="capability-label">{label}</text>
      <text className="value-text">{value}</text>
    </view>
  );
}

/**
 * @symbiote-native/device canary demo: a live-constants card (brand/model/OS/memory — all
 * resolved eagerly at import time, no async wait) plus a card for the three one-shot async
 * checks (getDeviceTypeAsync, getUptimeAsync, isRootedExperimentalAsync).
 */
export function DeviceScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Device];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [asyncDeviceType, setAsyncDeviceType] = useState<string | null>(null);
  const [uptime, setUptime] = useState<number | null>(null);
  const [isRooted, setIsRooted] = useState<boolean | null>(null);

  const handleGetDeviceType = useCallback(() => {
    getDeviceTypeAsync().then(value => {
      setAsyncDeviceType(deviceTypeLabel(value));
    });
  }, []);

  const handleGetUptime = useCallback(() => {
    getUptimeAsync().then(setUptime);
  }, []);

  const handleCheckRooted = useCallback(() => {
    isRootedExperimentalAsync().then(setIsRooted);
  }, []);

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="device-scroll"
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
            <text className="hero-title">Device</text>
            <text className="hero-body">
              @symbiote-native/device — brand/model/OS constants resolved
              eagerly at import time, plus one-shot async checks for device
              type, uptime, and root/jailbreak detection.
            </text>
          </view>
        </view>

        <view testID="device-constants-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Constants</text>
          </view>
          <ValueRow label="Is real device" value={isDevice ? 'Yes' : 'No'} />
          <ValueRow label="Brand" value={brand ?? 'unknown'} />
          <ValueRow label="Manufacturer" value={manufacturer ?? 'unknown'} />
          <ValueRow label="Model" value={modelName ?? 'unknown'} />
          <ValueRow label="Device type" value={deviceTypeLabel(deviceType)} />
          <ValueRow label="OS" value={osName ?? 'unknown'} />
          <ValueRow label="OS version" value={osVersion ?? 'unknown'} />
          <ValueRow label="Total memory" value={formatBytes(totalMemory)} />
          <ValueRow label="Device name" value={deviceName ?? 'unknown'} />
        </view>

        <view testID="device-async-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Async checks</text>
          </view>
          <ActionButton
            testID="device-type-button"
            title="Get device type"
            onPress={handleGetDeviceType}
            color={lineColor}
          />
          {asyncDeviceType !== null && (
            <ValueRow label="Device type (async)" value={asyncDeviceType} />
          )}
          <ActionButton
            testID="device-uptime-button"
            title="Get uptime"
            onPress={handleGetUptime}
            color={lineColor}
          />
          {uptime !== null && <ValueRow label="Uptime" value={`${uptime}ms`} />}
          <ActionButton
            testID="device-rooted-button"
            title="Check rooted/jailbroken"
            onPress={handleCheckRooted}
            color={lineColor}
          />
          {isRooted !== null && (
            <ValueRow
              label="Rooted/jailbroken"
              value={isRooted ? 'true' : 'false'}
            />
          )}
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
