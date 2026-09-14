import { createEffect, createSignal } from 'solid-js';
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
  const [isAirplaneMode, setIsAirplaneMode] = createSignal<boolean | null>(
    null,
  );

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
              createNetworkState(), plus the device's IP address and
              airplane-mode check. Toggle Wi-Fi or airplane mode on the device
              to see the live card update on its own.
            </text>
          </view>
        </view>

        <view testID="network-live-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Live network state</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Type</text>
            <text class="value-text">
              {networkTypeLabel(networkState().type)}
            </text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Connected</text>
            <text class="value-text">
              {networkState().isConnected === undefined
                ? 'checking…'
                : networkState().isConnected
                  ? 'Yes'
                  : 'No'}
            </text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Internet reachable</text>
            <text class="value-text">
              {networkState().isInternetReachable === undefined
                ? 'checking…'
                : networkState().isInternetReachable
                  ? 'Yes'
                  : 'No'}
            </text>
          </view>
        </view>

        <view testID="network-info-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Device info</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">IP address</text>
            <text class="value-text">
              {ipAddress() === null ? 'checking…' : ipAddress()}
            </text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Airplane mode</text>
            <text class="value-text">
              {isAirplaneMode() === null
                ? 'checking…'
                : isAirplaneMode()
                  ? 'On'
                  : 'Off'}
            </text>
          </view>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
