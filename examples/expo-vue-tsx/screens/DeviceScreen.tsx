import { defineComponent, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
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
} from '@symbiote-native/device/vue';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const BYTES_PER_UNIT = 1024;
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
type ISizeUnit = (typeof SIZE_UNITS)[number];

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
  const unit: ISizeUnit = SIZE_UNITS[unitIndex];
  return `${value.toFixed(precision)} ${unit}`;
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

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="capability-row">
      <text class="capability-label">{props.label}</text>
      <text class="value-text">{props.value}</text>
    </view>
  );
}

export const DeviceScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Device];
    const lineColor = LINE_COLOR[lineInfo.line];

    const asyncDeviceType: Ref<string | null> = ref(null);
    const uptime: Ref<number | null> = ref(null);
    const isRooted: Ref<boolean | null> = ref(null);

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });

    function handleGetDeviceType() {
      getDeviceTypeAsync().then(value => {
        if (isMounted) asyncDeviceType.value = deviceTypeLabel(value);
      });
    }

    function handleGetUptime() {
      getUptimeAsync().then(value => {
        if (isMounted) uptime.value = value;
      });
    }

    function handleCheckRooted() {
      isRootedExperimentalAsync().then(value => {
        if (isMounted) isRooted.value = value;
      });
    }

    return () => (
      <safe-area-view class="screen">
        <scroll-view
          testID="device-scroll"
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
              <text class="hero-title">Device</text>
              <text class="hero-body">
                Know what the app runs on: brand, model, OS version, memory,
                device type, uptime and whether the phone is rooted or
                jailbroken. Use it to adapt layouts, log bug reports and gate
                risky features.
              </text>
            </view>
          </view>

          <Scenario
            testID="device-scenario"
            title="Attach device details to a bug report or adapt to a tablet"
            why="Support tickets are far easier to solve with the model and OS version attached, and a tablet or a low-memory phone may need a different layout or lighter images."
            steps={['Read the constants card', 'Press the async checks for device type, uptime and root detection']}
            expect="Model, OS and memory match the phone in your hand. The simulator reports Is real device as No, and the root check returns false on a normal phone."
          />

          <view testID="device-constants-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Constants</text>
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

          <view testID="device-async-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Async checks</text>
            </view>
            <ActionButton
              testID="device-type-button"
              title="Get device type"
              onPress={handleGetDeviceType}
              color={lineColor}
            />
            {asyncDeviceType.value !== null && (
              <ValueRow label="Device type (async)" value={asyncDeviceType.value} />
            )}
            <ActionButton
              testID="device-uptime-button"
              title="Get uptime"
              onPress={handleGetUptime}
              color={lineColor}
            />
            {uptime.value !== null && (
              <ValueRow label="Uptime" value={`${uptime.value}ms`} />
            )}
            <ActionButton
              testID="device-rooted-button"
              title="Check rooted/jailbroken"
              onPress={handleCheckRooted}
              color={lineColor}
            />
            {isRooted.value !== null && (
              <ValueRow
                label="Rooted/jailbroken"
                value={isRooted.value ? 'true' : 'false'}
              />
            )}
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'DeviceScreen' },
);
