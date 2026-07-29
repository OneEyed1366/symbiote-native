<!--
  @symbiote-native/network tour stop — a live network-state card driven by useNetworkState()
  (seeded via getNetworkStateAsync(), refreshed by addNetworkStateListener()) plus a one-shot card
  for the IP address and airplane-mode check. Toggle Wi-Fi/airplane mode on the device to see the
  live card update on its own. Vue SFC twin of ../../react/screens/NetworkScreen.tsx.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import { NetworkStateType, getIpAddressAsync, isAirplaneModeEnabledAsync } from '@symbiote-native/network';
import { useNetworkState } from '@symbiote-native/network/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

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

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Network];
const lineColor = LINE_COLOR[lineInfo.line];

const networkState = useNetworkState();
const ipAddress = ref<string | null>(null);
const isAirplaneMode = ref<boolean | null>(null);

// Re-fetch alongside every live network-state change, mirroring the React screen's
// useEffect(..., [networkState]) — a Wi-Fi/airplane-mode toggle should refresh both cards
// together, not just the live one.
watch(
  networkState,
  () => {
    void Promise.all([getIpAddressAsync(), isAirplaneModeEnabledAsync()]).then(([ip, airplaneMode]) => {
      ipAddress.value = ip;
      isAirplaneMode.value = airplaneMode;
    });
  },
  { immediate: true },
);

const networkTypeText = computed(() => networkTypeLabel(networkState.value.type));
const isConnectedText = computed(() =>
  networkState.value.isConnected === undefined ? 'checking…' : networkState.value.isConnected ? 'Yes' : 'No',
);
const isInternetReachableText = computed(() =>
  networkState.value.isInternetReachable === undefined
    ? 'checking…'
    : networkState.value.isInternetReachable
      ? 'Yes'
      : 'No',
);
const ipAddressText = computed(() => (ipAddress.value === null ? 'checking…' : ipAddress.value));
const airplaneModeText = computed(() =>
  isAirplaneMode.value === null ? 'checking…' : isAirplaneMode.value ? 'On' : 'Off',
);
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView testID="network-scroll" class="screen" content-container-style="scroll-content">
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" :style="{ backgroundColor: lineColor }">
          <Text class="hero-badge-text">{{ lineInfo.code }}</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">Network</Text>
          <Text class="hero-body"
            >@symbiote-native/network — live network state via useNetworkState(), plus the
            device's IP address and airplane-mode check. Toggle Wi-Fi or airplane mode on the
            device to see the live card update on its own.</Text
          >
        </View>
      </View>

      <View testID="network-live-card" class="network-card">
        <Text class="network-card-title">Live network state</Text>
        <View class="network-row">
          <Text class="network-row-label">Type</Text>
          <Text testID="network-type-value" class="network-value-text">{{ networkTypeText }}</Text>
        </View>
        <View class="network-row">
          <Text class="network-row-label">Connected</Text>
          <Text testID="network-connected-value" class="network-value-text">{{ isConnectedText }}</Text>
        </View>
        <View class="network-row">
          <Text class="network-row-label">Internet reachable</Text>
          <Text testID="network-reachable-value" class="network-value-text">{{ isInternetReachableText }}</Text>
        </View>
      </View>

      <View testID="network-info-card" class="network-card">
        <Text class="network-card-title">Device info</Text>
        <View class="network-row">
          <Text class="network-row-label">IP address</Text>
          <Text testID="network-ip-value" class="network-value-text">{{ ipAddressText }}</Text>
        </View>
        <View class="network-row">
          <Text class="network-row-label">Airplane mode</Text>
          <Text testID="network-airplane-value" class="network-value-text">{{ airplaneModeText }}</Text>
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
