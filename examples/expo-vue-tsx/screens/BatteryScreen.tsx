import { computed, defineComponent, onMounted, onUnmounted, ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
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
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function CapabilityBadge(props: { status: ICapabilityStatus }) {
  const label =
    props.status === 'checking'
      ? 'CHECKING…'
      : props.status === 'yes'
        ? 'YES'
        : 'NO';
  return (
    <view class={`status-badge status-badge-${props.status}`}>
      <text class="status-badge-text">{label}</text>
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

export const BatteryScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Battery];
    const lineColor = LINE_COLOR[lineInfo.line];

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
        <scroll-view
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
                React to the battery: level, charging state and low-power mode
                update live through hooks, so the app can pause heavy work when
                the battery is low. A simulator reports the API as unavailable,
                use a real device.
              </text>
            </view>
          </view>

          <Scenario
            testID="battery-scenario"
            title="Pause sync and animations when the battery is low"
            why="Skip background uploads, heavy animations or video quality when the user is on low power or unplugged at low charge, and resume when they plug in."
            steps={['Turn Low Power Mode on in the system settings', 'Plug the charger in and out', 'Watch the live status card']}
            expect="Level, charging state and low power mode change on screen within a moment, without reloading."
          />

          <view testID="battery-live-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Live status</text>
            </view>
            <view class="capability-row">
              <text class="capability-label">Battery level</text>
              <text class="value-text">{batteryLevelLabel.value}</text>
            </view>
            <view class="capability-row">
              <text class="capability-label">Battery state</text>
              <text class="value-text">{batteryStateLabel(batteryState.value)}</text>
            </view>
            <view class="capability-row">
              <text class="capability-label">Low power mode</text>
              <text class="value-text">{lowPowerMode.value ? 'On' : 'Off'}</text>
            </view>
          </view>

          <view testID="battery-capabilities-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Capabilities</text>
            </view>
            <CapabilityRow
              testID="battery-available"
              label="Available"
              status={isAvailable.value}
            />
            {Platform.OS === 'android' && (
              <CapabilityRow
                testID="battery-optimization"
                label="Battery optimization enabled"
                status={isBatteryOptimizationEnabled.value}
              />
            )}
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'BatteryScreen' },
);
