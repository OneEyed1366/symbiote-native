import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
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
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const BYTES_PER_UNIT = 1024;
const MEMORY_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

function deviceTypeLabel(type: DeviceType | null): string {
  if (type === null) return 'unknown';
  switch (type) {
    case DeviceType.PHONE: return 'Phone';
    case DeviceType.TABLET: return 'Tablet';
    case DeviceType.DESKTOP: return 'Desktop';
    case DeviceType.TV: return 'TV';
    case DeviceType.UNKNOWN:
    default: return 'Unknown';
  }
}

function formatMemory(bytes: number | null): string {
  if (bytes === null) return 'unknown';
  if (bytes === 0) return '0 B';
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(BYTES_PER_UNIT)),
    MEMORY_UNITS.length - 1,
  );
  const value = bytes / BYTES_PER_UNIT ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${MEMORY_UNITS[exponent]}`;
}

function ValueRow(props: { label: string; value: string }) {
  return (
    <View class="auth-capability-row">
      <Text class="auth-capability-label">{props.label}</Text>
      <Text class="auth-value-text">{props.value}</Text>
    </View>
  );
}

/**
 * Device demo: @symbiote-native/device — every export is an eagerly-resolved constant or a
 * one-shot async call, so the top card renders the module-level constants directly (no
 * subscription, no capability check needed) while the bottom card exercises the three async
 * functions on demand. Vue TSX twin of ../../expo-react/screens/DeviceScreen.tsx.
 */
export const DeviceScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Device];
    const lineColor = LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.Device].line];

    const deviceTypeResult: Ref<string | null> = ref(null);
    const uptimeResult: Ref<number | null> = ref(null);
    const isRootedResult: Ref<boolean | null> = ref(null);

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });

    function handleGetDeviceType() {
      getDeviceTypeAsync().then(value => {
        if (isMounted) deviceTypeResult.value = deviceTypeLabel(value);
      });
    }

    function handleGetUptime() {
      getUptimeAsync().then(value => {
        if (isMounted) uptimeResult.value = value;
      });
    }

    function handleCheckRooted() {
      isRootedExperimentalAsync().then(value => {
        if (isMounted) isRootedResult.value = value;
      });
    }

    return () => (
      <SafeAreaView class="screen">
        <ScrollView testID="device-scroll" class="screen" contentContainerStyle="scroll-content">
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: lineColor }}>
              <Text class="hero-badge-text">{lineInfo.code}</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">Device</Text>
              <Text class="hero-body">
                @symbiote-native/device — brand/model/OS constants, memory, and root/jailbreak
                detection. Every export is a plain constant or a one-shot async call, no live
                subscription.
              </Text>
            </View>
          </View>

          <View testID="device-info-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Device info</Text>
            </View>
            <ValueRow label="Is device" value={isDevice ? 'Yes' : 'No'} />
            <ValueRow label="Brand" value={brand ?? 'unknown'} />
            <ValueRow label="Manufacturer" value={manufacturer ?? 'unknown'} />
            <ValueRow label="Model name" value={modelName ?? 'unknown'} />
            <ValueRow label="Device type" value={deviceTypeLabel(deviceType)} />
            <ValueRow label="OS name" value={osName ?? 'unknown'} />
            <ValueRow label="OS version" value={osVersion ?? 'unknown'} />
            <ValueRow label="Total memory" value={formatMemory(totalMemory)} />
            <ValueRow label="Device name" value={deviceName ?? 'unknown'} />
          </View>

          <View testID="device-actions-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Async checks</Text>
            </View>
            <ActionButton
              testID="device-type-button"
              title="Get device type"
              onPress={handleGetDeviceType}
              color={lineColor}
            />
            <ValueRow label="Device type (async)" value={deviceTypeResult.value ?? 'checking…'} />
            <ActionButton
              testID="device-uptime-button"
              title="Get uptime"
              onPress={handleGetUptime}
              color={lineColor}
            />
            <ValueRow
              label="Uptime"
              value={uptimeResult.value === null ? 'checking…' : `${uptimeResult.value}ms`}
            />
            <ActionButton
              testID="device-rooted-button"
              title="Check rooted / jailbroken"
              onPress={handleCheckRooted}
              color={lineColor}
            />
            <ValueRow
              label="Rooted / jailbroken"
              value={isRootedResult.value === null ? 'checking…' : isRootedResult.value ? 'true' : 'false'}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'DeviceScreen' },
);
