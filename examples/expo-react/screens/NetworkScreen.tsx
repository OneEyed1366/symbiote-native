import { useEffect, useState } from 'react';
import {
  NetworkStateType,
  getIpAddressAsync,
  isAirplaneModeEnabledAsync,
} from '@symbiote-native/network';
import { useNetworkState } from '@symbiote-native/network/react';
import { ROUTE_NAME } from '../routes';
import { Scenario } from '../components/Scenario';
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

export function NetworkScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Network];
  const lineColor = LINE_COLOR[lineInfo.line];

  const networkState = useNetworkState();
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [isAirplaneMode, setIsAirplaneMode] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([getIpAddressAsync(), isAirplaneModeEnabledAsync()]).then(
      ([ip, airplaneMode]) => {
        if (isMounted) {
          setIpAddress(ip);
          setIsAirplaneMode(airplaneMode);
        }
      },
    );
    return () => {
      isMounted = false;
    };
  }, [networkState]);

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="network-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view className="hero-card">
          <view className="hero-badge" style={{ backgroundColor: lineColor }}>
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Network</text>
            <text className="hero-body">
              React to connectivity: the connection type, whether the internet
              is reachable, the device IP address and airplane mode, updating
              live as the network changes.
            </text>
          </view>
        </view>

        <Scenario
          testID="network-scenario"
          title="Show an offline banner and queue work until the network is back"
          why="Tell users when they are offline instead of letting requests fail silently, and retry uploads when the connection returns. Connected does not always mean the internet is reachable."
          steps={['Turn Wi-Fi off, then airplane mode on', 'Watch the live card', 'Turn everything back on']}
          expect="Type, connected and internet reachable change within a moment each time, and airplane mode reads Yes while it is on."
        />
        <view testID="network-live-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Live network state</text>
          </view>
          <view className="capability-row">
            <text className="capability-label">Type</text>
            <text className="value-text">
              {networkTypeLabel(networkState.type)}
            </text>
          </view>
          <view className="capability-row">
            <text className="capability-label">Connected</text>
            <text className="value-text">
              {networkState.isConnected === undefined
                ? 'checking…'
                : networkState.isConnected
                  ? 'Yes'
                  : 'No'}
            </text>
          </view>
          <view className="capability-row">
            <text className="capability-label">Internet reachable</text>
            <text className="value-text">
              {networkState.isInternetReachable === undefined
                ? 'checking…'
                : networkState.isInternetReachable
                  ? 'Yes'
                  : 'No'}
            </text>
          </view>
        </view>

        <view testID="network-info-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Device info</text>
          </view>
          <view className="capability-row">
            <text className="capability-label">IP address</text>
            <text className="value-text">
              {ipAddress === null ? 'checking…' : ipAddress}
            </text>
          </view>
          <view className="capability-row">
            <text className="capability-label">Airplane mode</text>
            <text className="value-text">
              {isAirplaneMode === null
                ? 'checking…'
                : isAirplaneMode
                  ? 'On'
                  : 'Off'}
            </text>
          </view>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
