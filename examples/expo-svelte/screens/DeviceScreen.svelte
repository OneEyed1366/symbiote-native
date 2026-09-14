<script lang="ts">
  // @symbiote-native/device tour stop — an eager-constants card (isDevice/brand/manufacturer/
  // modelName/deviceType/osName/osVersion/totalMemory/deviceName, all resolved once at import time,
  // so no $effect is needed) plus an actions card for the three one-shot async calls
  // (getDeviceTypeAsync/getUptimeAsync/isRootedExperimentalAsync). Svelte twin of
  // examples/expo-vue-sfc/screens/DeviceScreen.vue.
  import { ScrollView } from '@symbiote-native/svelte';
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
  } from '@symbiote-native/device/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const BYTES_PER_UNIT = 1024;
  const MEMORY_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const DECIMAL_PLACES = 1;

  function formatMemorySize(bytes: number | null): string {
    if (bytes === null) return 'unknown';
    if (bytes === 0) return '0 B';
    const unitIndex = Math.min(
      Math.floor(Math.log(bytes) / Math.log(BYTES_PER_UNIT)),
      MEMORY_UNITS.length - 1,
    );
    const value = bytes / BYTES_PER_UNIT ** unitIndex;
    return `${value.toFixed(unitIndex === 0 ? 0 : DECIMAL_PLACES)} ${MEMORY_UNITS[unitIndex]}`;
  }

  function deviceTypeLabel(type: DeviceType | null): string {
    switch (type) {
      case DeviceType.UNKNOWN:
        return 'Unknown';
      case DeviceType.PHONE:
        return 'Phone';
      case DeviceType.TABLET:
        return 'Tablet';
      case DeviceType.DESKTOP:
        return 'Desktop';
      case DeviceType.TV:
        return 'TV';
      default:
        return 'checking…';
    }
  }

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Device];
  const lineColor = LINE_COLOR[lineInfo.line];

  const totalMemoryText = formatMemorySize(totalMemory);

  let deviceTypeResult = $state<string | null>(null);
  let uptimeResult = $state<number | null>(null);
  let isRootedResult = $state<boolean | null>(null);

  function handleGetDeviceType(): void {
    void getDeviceTypeAsync().then(type => {
      deviceTypeResult = deviceTypeLabel(type);
    });
  }

  function handleGetUptime(): void {
    void getUptimeAsync().then(value => {
      uptimeResult = value;
    });
  }

  function handleCheckRooted(): void {
    void isRootedExperimentalAsync().then(value => {
      isRootedResult = value;
    });
  }
</script>

<safe-area-view class="screen">
  <ScrollView
    testID="device-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: lineColor }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">Device</text>
        <text class="hero-body">
          @symbiote-native/device — physical device info: brand/model/OS
          constants, memory, and best-effort root/jailbreak detection. A
          Simulator/emulator reports `isDevice` as false and several fields as
          unavailable.
        </text>
      </view>
    </view>
    <view testID="device-info-card" class="device-card">
      <text class="device-card-title">Info</text>
      <view class="device-row">
        <text class="device-row-label">Is device</text>
        <text testID="device-is-device-value" class="device-value-text">
          {isDevice ? 'Yes' : 'No (simulator/emulator)'}
        </text>
      </view>
      <view class="device-row">
        <text class="device-row-label">Brand</text>
        <text class="device-value-text">{brand ?? 'unknown'}</text>
      </view>
      <view class="device-row">
        <text class="device-row-label">Manufacturer</text>
        <text class="device-value-text">{manufacturer ?? 'unknown'}</text>
      </view>
      <view class="device-row">
        <text class="device-row-label">Model name</text>
        <text class="device-value-text">{modelName ?? 'unknown'}</text>
      </view>
      <view class="device-row">
        <text class="device-row-label">Device type</text>
        <text class="device-value-text">{deviceTypeLabel(deviceType)}</text>
      </view>
      <view class="device-row">
        <text class="device-row-label">OS</text>
        <text class="device-value-text">
          {`${osName ?? 'unknown'} ${osVersion ?? ''}`}
        </text>
      </view>
      <view class="device-row">
        <text class="device-row-label">Total memory</text>
        <text class="device-value-text">{totalMemoryText}</text>
      </view>
      <view class="device-row">
        <text class="device-row-label">Device name</text>
        <text testID="device-name-value" class="device-value-text">
          {deviceName ?? 'unnamed device'}
        </text>
      </view>
    </view>
    <view testID="device-actions-card" class="device-card">
      <text class="device-card-title">Actions</text>
      <view class="button-row">
        <ActionButton
          testID="device-get-type-button"
          title="Get Device Type"
          onPress={handleGetDeviceType}
          color={lineColor}
        />
        <ActionButton
          testID="device-get-uptime-button"
          title="Get Uptime"
          onPress={handleGetUptime}
          color={lineColor}
        />
        <ActionButton
          testID="device-check-rooted-button"
          title="Check Rooted"
          onPress={handleCheckRooted}
          color={lineColor}
        />
      </view>
      {#if deviceTypeResult !== null}<view class="device-row">
          <text class="device-row-label">Device type result</text>
          <text testID="device-type-result-value" class="device-value-text">
            {deviceTypeResult}
          </text>
        </view>{/if}{#if uptimeResult !== null}<view class="device-row">
          <text class="device-row-label">Uptime</text>
          <text testID="device-uptime-result-value" class="device-value-text">
            {`${uptimeResult}ms`}
          </text>
        </view>{/if}{#if isRootedResult !== null}<view class="device-row">
          <text class="device-row-label">Rooted/jailbroken</text>
          <text testID="device-rooted-result-value" class="device-value-text">
            {isRootedResult ? 'true' : 'false'}
          </text>
        </view>{/if}
    </view>
  </ScrollView>
</safe-area-view>
