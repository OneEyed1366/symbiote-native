import { computed, defineComponent, onMounted, onUnmounted, ref } from 'vue';
import { Platform, ScrollView } from '@symbiote-native/vue';
import {
  useBatteryLevel,
  useBatteryState,
  useLowPowerMode,
} from '@symbiote-native/battery/vue';
import {
  BatteryState,
  isAvailableAsync,
  isBatteryOptimizationEnabledAsync,
} from '@symbiote-native/battery';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function batteryStateLabel(state: BatteryState): string {
  switch (state) {
    case BatteryState.UNKNOWN:
      return 'Unknown';
    case BatteryState.UNPLUGGED:
      return 'Unplugged';
    case BatteryState.CHARGING:
      return 'Charging';
    case BatteryState.FULL:
      return 'Full';
    case BatteryState.NOT_CHARGING:
      return 'Not charging';
    default:
      return 'Unknown';
  }
}

function CapabilityRow(props: {
  testID: string;
  label: string;
  status: ICapabilityStatus;
}) {
  return (
    <view testID={props.testID} class="auth-capability-row">
      <text class="auth-capability-label">{props.label}</text>
      <view class={`auth-status-badge auth-status-badge-${props.status}`}>
        <text class="auth-status-text">
          {props.status === 'checking'
            ? 'CHECKING…'
            : props.status === 'yes'
              ? 'YES'
              : 'NO'}
        </text>
      </view>
    </view>
  );
}

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="auth-capability-row">
      <text class="auth-capability-label">{props.label}</text>
      <text class="auth-value-text">{props.value}</text>
    </view>
  );
}

/**
 * Battery demo: @symbiote-native/battery — the three listener-backed composables
 * (useBatteryLevel/useBatteryState/useLowPowerMode) drive the live-state card; isAvailableAsync()
 * and, Android-only, isBatteryOptimizationEnabledAsync() are one-shot capability checks resolved
 * on mount, matching @symbiote-native/local-auth's capability-card shape. The iOS Simulator
 * reports batteryLevel as -1 (unknown) — a real device is needed for live readings.
 */
export const BatteryScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Battery];
    const lineColor = LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.Battery].line];

    const batteryLevel = useBatteryLevel();
    const batteryState = useBatteryState();
    const lowPowerMode = useLowPowerMode();

    const batteryLevelLabel = computed(() =>
      batteryLevel.value < 0
        ? 'unknown'
        : `${Math.round(batteryLevel.value * 100)}%`,
    );

    const isAvailable = ref<ICapabilityStatus>('checking');
    const isBatteryOptimizationEnabled = ref<ICapabilityStatus>('checking');

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });

    onMounted(() => {
      isAvailableAsync().then(value => {
        if (isMounted) isAvailable.value = toCapabilityStatus(value);
      });
      if (Platform.OS === 'android') {
        isBatteryOptimizationEnabledAsync().then(value => {
          if (isMounted)
            isBatteryOptimizationEnabled.value = toCapabilityStatus(value);
        });
      }
    });

    return () => (
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
                @symbiote-native/battery — live battery level, charging state,
                and low-power-mode, via three composables. The iOS Simulator
                reports battery level as unknown — a real device is needed for
                live readings.
              </text>
            </view>
          </view>

          <view testID="battery-live-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Live state</text>
            </view>
            <ValueRow label="Battery level" value={batteryLevelLabel.value} />
            <ValueRow
              label="Battery state"
              value={batteryStateLabel(batteryState.value)}
            />
            <CapabilityRow
              testID="battery-low-power-mode"
              label="Low power mode"
              status={toCapabilityStatus(lowPowerMode.value)}
            />
          </view>

          <view testID="battery-capabilities-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Capabilities</text>
            </view>
            <CapabilityRow
              testID="battery-available"
              label="Battery API available"
              status={isAvailable.value}
            />
            {Platform.OS === 'android' && (
              <CapabilityRow
                testID="battery-optimization-enabled"
                label="Battery optimization enabled"
                status={isBatteryOptimizationEnabled.value}
              />
            )}
          </view>
        </ScrollView>
      </safe-area-view>
    );
  },
  { name: 'BatteryScreen' },
);
