<script lang="ts">
  // @symbiote-native/device tour stop — an eager-constants card (isDevice/brand/manufacturer/
  // modelName/deviceType/osName/osVersion/totalMemory/deviceName, all resolved once at import time,
  // so no $effect is needed) plus an actions card for the three one-shot async calls
  // (getDeviceTypeAsync/getUptimeAsync/isRootedExperimentalAsync). Svelte twin of
  // examples/expo-vue-sfc/screens/DeviceScreen.vue.
  import {
    SafeAreaView,
    ScrollView,
    Text,
    View,
  } from '@symbiote-native/svelte';
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

<SafeAreaView class="screen">
  <ScrollView
    testID="device-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <View class={`line-tag line-tag-${lineInfo.line}`}>
      <Text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </Text>
    </View>
    <View class="hero-card">
      <View class="hero-badge" style={{ backgroundColor: lineColor }}>
        <Text class="hero-badge-text">{lineInfo.code}</Text>
      </View>
      <View class="hero-copy">
        <Text class="hero-title">Device</Text>
        <Text class="hero-body">
          @symbiote-native/device — physical device info: brand/model/OS
          constants, memory, and best-effort root/jailbreak detection. A
          Simulator/emulator reports `isDevice` as false and several fields as
          unavailable.
        </Text>
      </View>
    </View>
    <View testID="device-info-card" class="device-card">
      <Text class="device-card-title">Info</Text>
      <View class="device-row">
        <Text class="device-row-label">Is device</Text>
        <Text testID="device-is-device-value" class="device-value-text">
          {isDevice ? 'Yes' : 'No (simulator/emulator)'}
        </Text>
      </View>
      <View class="device-row">
        <Text class="device-row-label">Brand</Text>
        <Text class="device-value-text">{brand ?? 'unknown'}</Text>
      </View>
      <View class="device-row">
        <Text class="device-row-label">Manufacturer</Text>
        <Text class="device-value-text">{manufacturer ?? 'unknown'}</Text>
      </View>
      <View class="device-row">
        <Text class="device-row-label">Model name</Text>
        <Text class="device-value-text">{modelName ?? 'unknown'}</Text>
      </View>
      <View class="device-row">
        <Text class="device-row-label">Device type</Text>
        <Text class="device-value-text">{deviceTypeLabel(deviceType)}</Text>
      </View>
      <View class="device-row">
        <Text class="device-row-label">OS</Text>
        <Text class="device-value-text">
          {`${osName ?? 'unknown'} ${osVersion ?? ''}`}
        </Text>
      </View>
      <View class="device-row">
        <Text class="device-row-label">Total memory</Text>
        <Text class="device-value-text">{totalMemoryText}</Text>
      </View>
      <View class="device-row">
        <Text class="device-row-label">Device name</Text>
        <Text testID="device-name-value" class="device-value-text">
          {deviceName ?? 'unnamed device'}
        </Text>
      </View>
    </View>
    <View testID="device-actions-card" class="device-card">
      <Text class="device-card-title">Actions</Text>
      <View class="button-row">
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
      </View>{#if deviceTypeResult !== null}<View class="device-row">
          <Text class="device-row-label">Device type result</Text>
          <Text testID="device-type-result-value" class="device-value-text">
            {deviceTypeResult}
          </Text>
        </View>{/if}{#if uptimeResult !== null}<View class="device-row">
          <Text class="device-row-label">Uptime</Text>
          <Text testID="device-uptime-result-value" class="device-value-text">
            {`${uptimeResult}ms`}
          </Text>
        </View>{/if}{#if isRootedResult !== null}<View class="device-row">
          <Text class="device-row-label">Rooted/jailbroken</Text>
          <Text testID="device-rooted-result-value" class="device-value-text">
            {isRootedResult ? 'true' : 'false'}
          </Text>
        </View>{/if}
    </View>
  </ScrollView>
</SafeAreaView>
