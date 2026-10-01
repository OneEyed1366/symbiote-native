<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import {
  NetworkStateType,
  getIpAddressAsync,
  isAirplaneModeEnabledAsync,
  useNetworkState,
} from '@symbiote-native/network/vue';
import Scenario from '../components/Scenario.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import ValueRow from './ValueRow.vue';

const PENDING_LABEL = 'checking…';

function networkTypeLabel(type: NetworkStateType | undefined): string {
  switch (type) {
    case NetworkStateType.WIFI:
      return 'Wi-Fi';
    case NetworkStateType.CELLULAR:
      return 'Cellular';
    case NetworkStateType.BLUETOOTH:
      return 'Bluetooth';
    case NetworkStateType.ETHERNET:
      return 'Ethernet';
    case NetworkStateType.WIMAX:
      return 'WiMAX';
    case NetworkStateType.VPN:
      return 'VPN';
    case NetworkStateType.OTHER:
      return 'Other';
    case NetworkStateType.NONE:
      return 'None';
    case NetworkStateType.UNKNOWN:
    default:
      return 'Unknown';
  }
}

function yesNoLabel(value: boolean | undefined): string {
  if (value === undefined) return PENDING_LABEL;
  return value ? 'Yes' : 'No';
}

function airplaneModeLabel(isEnabled: boolean | null): string {
  if (isEnabled === null) return PENDING_LABEL;
  return isEnabled ? 'On' : 'Off';
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Network];
const lineColor = LINE_COLOR[lineInfo.line];

const networkState = useNetworkState();
const ipAddress = ref<string | null>(null);
const isAirplaneMode = ref<boolean | null>(null);

// The bare read of `networkState.value` re-runs the lookups on every live state change
watchEffect(onCleanup => {
  void networkState.value;
  let isCurrent = true;
  onCleanup(() => {
    isCurrent = false;
  });
  void Promise.all([getIpAddressAsync(), isAirplaneModeEnabledAsync()]).then(
    ([ip, airplaneMode]) => {
      if (isCurrent) {
        ipAddress.value = ip;
        isAirplaneMode.value = airplaneMode;
      }
    },
  );
});
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view testID="network-scroll" class="screen" contentContainerStyle="scroll-content">
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Network</text>
          <text class="hero-body">
            React to connectivity: the connection type, whether the internet is reachable, the
            device IP address and airplane mode, updating live as the network changes.
          </text>
        </view>
      </view>

      <Scenario
        testID="network-scenario"
        title="Show an offline banner and queue work until the network is back"
        why="Tell users when they are offline instead of letting requests fail silently, and retry uploads when the connection returns. Connected does not always mean the internet is reachable."
        :steps="[
          'Turn Wi-Fi off, then airplane mode on',
          'Watch the live card',
          'Turn everything back on',
        ]"
        expect="Type, connected and internet reachable change within a moment each time, and airplane mode reads Yes while it is on."
      />

      <view testID="network-live-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Live network state</text>
        </view>
        <ValueRow label="Type" :value="networkTypeLabel(networkState.type)" />
        <ValueRow label="Connected" :value="yesNoLabel(networkState.isConnected)" />
        <ValueRow
          label="Internet reachable"
          :value="yesNoLabel(networkState.isInternetReachable)"
        />
      </view>

      <view testID="network-info-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Device info</text>
        </view>
        <ValueRow label="IP address" :value="ipAddress === null ? PENDING_LABEL : ipAddress" />
        <ValueRow label="Airplane mode" :value="airplaneModeLabel(isAirplaneMode)" />
      </view>
    </scroll-view>
  </safe-area-view>
</template>
