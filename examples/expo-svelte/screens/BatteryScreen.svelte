<script lang="ts">
  import { Platform } from '@symbiote-native/svelte';
  import {
    BatteryState,
    isAvailableAsync,
    isBatteryOptimizationEnabledAsync,
    useBatteryLevel,
    useBatteryState,
    useLowPowerMode,
  } from '@symbiote-native/battery/svelte';
  import Scenario from '../components/Scenario.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  const CAPABILITY_LABEL: Record<ICapabilityStatus, string> = {
    checking: 'CHECKING…',
    yes: 'YES',
    no: 'NO',
  };

  // `core/battery.ts` returns a negative level (its -1 sentinel) on a host that cannot measure one
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
        return 'Not charging (protecting battery)';
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

  // Write-only over the two status variables, so the dependency set stays empty and this runs once
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

{#snippet capabilityRow(testID: string, label: string, status: ICapabilityStatus)}
  <view {testID} class="capability-row">
    <text class="capability-label">{label}</text>
    <view class={`status-badge status-badge-${status}`}>
      <text class="status-badge-text">{CAPABILITY_LABEL[status]}</text>
    </view>
  </view>
{/snippet}

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
          React to the battery: level, charging state and low-power mode update
          live through hooks, so the app can pause heavy work when the battery
          is low. A simulator reports the API as unavailable, use a real device.
        </text>
      </view>
    </view>

    <Scenario
      testID="battery-scenario"
      title="Pause sync and animations when the battery is low"
      why="Skip background uploads, heavy animations or video quality when the user is on low power or unplugged at low charge, and resume when they plug in."
      steps={[
        'Turn Low Power Mode on in the system settings',
        'Plug the charger in and out',
        'Watch the live status card',
      ]}
      expect="Level, charging state and low power mode change on screen within a moment, without reloading."
    />

    <view testID="battery-live-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Live status</text>
      </view>
      <view class="capability-row">
        <text class="capability-label">Battery level</text>
        <text class="value-text">{batteryLevelText}</text>
      </view>
      <view class="capability-row">
        <text class="capability-label">Battery state</text>
        <text class="value-text">{batteryStateLabel(batteryState.current)}</text>
      </view>
      <view class="capability-row">
        <text class="capability-label">Low power mode</text>
        <text class="value-text">{lowPowerMode.current ? 'On' : 'Off'}</text>
      </view>
    </view>

    <view testID="battery-capabilities-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Capabilities</text>
      </view>
      {@render capabilityRow('battery-available', 'Available', availabilityStatus)}
      {#if Platform.OS === 'android'}
        {@render capabilityRow(
          'battery-optimization',
          'Battery optimization enabled',
          optimizationStatus,
        )}
      {/if}
    </view>
  </scroll-view>
</safe-area-view>
