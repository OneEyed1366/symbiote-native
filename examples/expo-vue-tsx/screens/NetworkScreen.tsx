import { computed, defineComponent, onUnmounted, ref, watch } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import {
  NetworkStateType,
  getIpAddressAsync,
  isAirplaneModeEnabledAsync,
} from '@symbiote-native/network';
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

function ValueRow(props: { label: string; value: string }) {
  return (
    <View class="auth-capability-row">
      <Text class="auth-capability-label">{props.label}</Text>
      <Text class="auth-value-text">{props.value}</Text>
    </View>
  );
}

/**
 * Network demo: @symbiote-native/network — a live network-state card driven by
 * useNetworkState() (seeded via getNetworkStateAsync(), refreshed by addNetworkStateListener())
 * plus a one-shot card for the IP address and airplane-mode check. Toggle Wi-Fi/airplane mode on
 * the device to see the live card update on its own. Vue TSX twin of
 * ../../expo-react/screens/NetworkScreen.tsx.
 */
export const NetworkScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Network];
    const lineColor = LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.Network].line];

    const networkState = useNetworkState();
    const ipAddress = ref<string | null>(null);
    const isAirplaneMode = ref<boolean | null>(null);

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });

    function refreshDeviceInfo() {
      Promise.all([getIpAddressAsync(), isAirplaneModeEnabledAsync()]).then(
        ([ip, airplaneMode]) => {
          if (isMounted) {
            ipAddress.value = ip;
            isAirplaneMode.value = airplaneMode;
          }
        },
      );
    }

    watch(networkState, refreshDeviceInfo, { immediate: true });

    const connectedLabel = computed(() =>
      networkState.value.isConnected === undefined
        ? 'checking…'
        : networkState.value.isConnected
          ? 'Yes'
          : 'No',
    );
    const internetReachableLabel = computed(() =>
      networkState.value.isInternetReachable === undefined
        ? 'checking…'
        : networkState.value.isInternetReachable
          ? 'Yes'
          : 'No',
    );
    const ipAddressLabel = computed(() =>
      ipAddress.value === null ? 'checking…' : ipAddress.value,
    );
    const airplaneModeLabel = computed(() =>
      isAirplaneMode.value === null
        ? 'checking…'
        : isAirplaneMode.value
          ? 'On'
          : 'Off',
    );

    return () => (
      <SafeAreaView class="screen">
        <ScrollView
          testID="network-scroll"
          class="screen"
          contentContainerStyle="scroll-content"
        >
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: lineColor }}>
              <Text class="hero-badge-text">{lineInfo.code}</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">Network</Text>
              <Text class="hero-body">
                @symbiote-native/network — live network state via
                useNetworkState(), plus the device's IP address and
                airplane-mode check. Toggle Wi-Fi or airplane mode on the device
                to see the live card update on its own.
              </Text>
            </View>
          </View>

          <View testID="network-live-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Live network state</Text>
            </View>
            <ValueRow
              label="Type"
              value={networkTypeLabel(networkState.value.type)}
            />
            <ValueRow label="Connected" value={connectedLabel.value} />
            <ValueRow
              label="Internet reachable"
              value={internetReachableLabel.value}
            />
          </View>

          <View testID="network-info-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Device info</Text>
            </View>
            <ValueRow label="IP address" value={ipAddressLabel.value} />
            <ValueRow label="Airplane mode" value={airplaneModeLabel.value} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'NetworkScreen' },
);
