import { createEffect, createSignal } from 'solid-js';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/solid';
import {
  NetworkStateType,
  getIpAddressAsync,
  isAirplaneModeEnabledAsync,
} from '@symbiote-native/network';
import { createNetworkState } from '@symbiote-native/network/solid';
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

/**
 * @symbiote-native/network canary demo: a live network-state card driven by createNetworkState()
 * (seeded via getNetworkStateAsync(), refreshed by addNetworkStateListener()) plus a one-shot
 * card for the IP address and airplane-mode check. Toggle Wi-Fi/airplane mode on the device to
 * see the live card update on its own.
 */
export function NetworkScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Network];
  const lineColor = LINE_COLOR[lineInfo.line];

  const networkState = createNetworkState();
  const [ipAddress, setIpAddress] = createSignal<string | null>(null);
  const [isAirplaneMode, setIsAirplaneMode] = createSignal<boolean | null>(null);

  // Tracked read of networkState() at the top re-runs this every time the live state changes,
  // matching the React source's useEffect(fn, [networkState]) dependency.
  createEffect(() => {
    networkState();
    let isCurrent = true;
    Promise.all([getIpAddressAsync(), isAirplaneModeEnabledAsync()]).then(
      ([ip, airplaneMode]) => {
        if (isCurrent) {
          setIpAddress(ip);
          setIsAirplaneMode(airplaneMode);
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  });

  return (
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
              createNetworkState(), plus the device's IP address and
              airplane-mode check. Toggle Wi-Fi or airplane mode on the device
              to see the live card update on its own.
            </Text>
          </View>
        </View>

        <View testID="network-live-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Live network state</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Type</Text>
            <Text class="value-text">
              {networkTypeLabel(networkState().type)}
            </Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Connected</Text>
            <Text class="value-text">
              {networkState().isConnected === undefined
                ? 'checking…'
                : networkState().isConnected
                  ? 'Yes'
                  : 'No'}
            </Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Internet reachable</Text>
            <Text class="value-text">
              {networkState().isInternetReachable === undefined
                ? 'checking…'
                : networkState().isInternetReachable
                  ? 'Yes'
                  : 'No'}
            </Text>
          </View>
        </View>

        <View testID="network-info-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Device info</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">IP address</Text>
            <Text class="value-text">
              {ipAddress() === null ? 'checking…' : ipAddress()}
            </Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Airplane mode</Text>
            <Text class="value-text">
              {isAirplaneMode() === null
                ? 'checking…'
                : isAirplaneMode()
                  ? 'On'
                  : 'Off'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
