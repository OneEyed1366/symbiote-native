import { computed, defineComponent, onUnmounted, ref, watch } from 'vue';
import {} from '@symbiote-native/vue';
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
    <view class="auth-capability-row">
      <text class="auth-capability-label">{props.label}</text>
      <text class="auth-value-text">{props.value}</text>
    </view>
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
      <safe-area-view class="screen">
        <scroll-view
          testID="network-scroll"
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
              <text class="hero-title">Network</text>
              <text class="hero-body">
                @symbiote-native/network — live network state via
                useNetworkState(), plus the device's IP address and
                airplane-mode check. Toggle Wi-Fi or airplane mode on the device
                to see the live card update on its own.
              </text>
            </view>
          </view>

          <view testID="network-live-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Live network state</text>
            </view>
            <ValueRow
              label="Type"
              value={networkTypeLabel(networkState.value.type)}
            />
            <ValueRow label="Connected" value={connectedLabel.value} />
            <ValueRow
              label="Internet reachable"
              value={internetReachableLabel.value}
            />
          </view>

          <view testID="network-info-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Device info</text>
            </view>
            <ValueRow label="IP address" value={ipAddressLabel.value} />
            <ValueRow label="Airplane mode" value={airplaneModeLabel.value} />
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'NetworkScreen' },
);
