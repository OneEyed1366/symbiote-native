<script lang="ts">
  // @symbiote-native/battery tour stop — a live card driven by the three runes
  // (useBatteryLevel/useBatteryState/useLowPowerMode) plus a one-shot capabilities card
  // (isAvailableAsync, Android-only isBatteryOptimizationEnabledAsync). A Simulator with no
  // physical battery reports the API as unavailable; a real device is needed for live readings.
  // Svelte twin of examples/expo-vue-sfc/screens/BatteryScreen.vue.
  import {
    Platform,
    SafeAreaView,
    ScrollView,
    Text,
    View,
  } from '@symbiote-native/svelte';
  import {
    BatteryState,
    isAvailableAsync,
    isBatteryOptimizationEnabledAsync,
    useBatteryLevel,
    useBatteryState,
    useLowPowerMode,
  } from '@symbiote-native/battery/svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  const CAPABILITY_LABEL: Record<ICapabilityStatus, string> = {
    checking: 'CHECKING…',
    yes: 'YES',
    no: 'NO',
  };

  // core/battery.ts hands back a negative level (its -1 sentinel) on a host that cannot measure
  // one at all, so anything below zero is "no reading", not a real percentage.
  const MIN_MEASURABLE_LEVEL = 0;
  const PERCENT_SCALE = 100;

  function toCapabilityStatus(isEnabled: boolean): ICapabilityStatus {
    return isEnabled ? 'yes' : 'no';
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
        return 'Not charging (protected)';
      default:
        return 'Unknown';
    }
  }

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Battery];
  const lineColor = LINE_COLOR[lineInfo.line];

  const batteryLevel = useBatteryLevel();
  const batteryState = useBatteryState();
  const lowPowerMode = useLowPowerMode();

  let availabilityStatus = $state<ICapabilityStatus>('checking');
  let optimizationStatus = $state<ICapabilityStatus>('checking');

  const batteryLevelText = $derived(
    batteryLevel.current < MIN_MEASURABLE_LEVEL
      ? 'unknown'
      : `${Math.round(batteryLevel.current * PERCENT_SCALE)}%`,
  );
  const batteryStateText = $derived(batteryStateLabel(batteryState.current));
  const lowPowerModeText = $derived(lowPowerMode.current ? 'ON' : 'OFF');

  // Write-only over the two status variables, so the dependency set stays empty and this runs
  // exactly once on mount — the twin of the Vue screen's onMounted.
  $effect(() => {
    void isAvailableAsync().then(isSupported => {
      availabilityStatus = toCapabilityStatus(isSupported);
    });
    if (Platform.OS === 'android') {
      void isBatteryOptimizationEnabledAsync().then(isEnabled => {
        optimizationStatus = toCapabilityStatus(isEnabled);
      });
    }
  });
</script>

<SafeAreaView class="screen">
  <ScrollView
    testID="battery-scroll"
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
        <Text class="hero-title">Battery</Text>
        <Text class="hero-body">
          @symbiote-native/battery — live battery level, charging state, and
          low-power mode, over three Svelte runes. The iOS Simulator reports the
          battery API as unavailable; a real device is needed to see live
          readings.
        </Text>
      </View>
    </View>
    <View testID="battery-live-card" class="battery-card">
      <Text class="battery-card-title">Live</Text>
      <View class="battery-row">
        <Text class="battery-row-label">Level</Text>
        <Text testID="battery-level-value" class="battery-value-text">
          {batteryLevelText}
        </Text>
      </View>
      <View class="battery-row">
        <Text class="battery-row-label">State</Text>
        <Text testID="battery-state-value" class="battery-value-text">
          {batteryStateText}
        </Text>
      </View>
      <View class="battery-row">
        <Text class="battery-row-label">Low power mode</Text>
        <Text testID="battery-low-power-value" class="battery-value-text">
          {lowPowerModeText}
        </Text>
      </View>
    </View>
    <View testID="battery-capabilities-card" class="battery-card">
      <Text class="battery-card-title">Capabilities</Text>
      <View class="battery-row">
        <Text class="battery-row-label">Available</Text>
        <View
          class={`battery-status-badge battery-status-badge-${availabilityStatus}`}
        >
          <Text class="battery-status-text">
            {CAPABILITY_LABEL[availabilityStatus]}
          </Text>
        </View>
      </View>{#if Platform.OS === 'android'}<View class="battery-row">
          <Text class="battery-row-label">Battery optimization enabled</Text>
          <View
            class={`battery-status-badge battery-status-badge-${optimizationStatus}`}
          >
            <Text class="battery-status-text">
              {CAPABILITY_LABEL[optimizationStatus]}
            </Text>
          </View>
        </View>{/if}
    </View>
  </ScrollView>
</SafeAreaView>
