import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/react';
import { NetworkStateType, getIpAddressAsync, isAirplaneModeEnabledAsync } from '@symbiote-native/network';
import { useNetworkState } from '@symbiote-native/network/react';
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
 * @symbiote-native/network canary demo: a live network-state card driven by useNetworkState()
 * (seeded via getNetworkStateAsync(), refreshed by addNetworkStateListener()) plus a one-shot
 * card for the IP address and airplane-mode check. Toggle Wi-Fi/airplane mode on the device to
 * see the live card update on its own.
 */
export function NetworkScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Network];
  const lineColor = LINE_COLOR[lineInfo.line];

  const networkState = useNetworkState();
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [isAirplaneMode, setIsAirplaneMode] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([getIpAddressAsync(), isAirplaneModeEnabledAsync()]).then(([ip, airplaneMode]) => {
      if (isMounted) {
        setIpAddress(ip);
        setIsAirplaneMode(airplaneMode);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [networkState]);

  return (
    <SafeAreaView className="screen">
      <ScrollView testID="network-scroll" className="screen" contentContainerStyle="scroll-content">
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text className="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Network</Text>
            <Text className="hero-body">
              @symbiote-native/network — live network state via useNetworkState(), plus the
              device's IP address and airplane-mode check. Toggle Wi-Fi or airplane mode on the
              device to see the live card update on its own.
            </Text>
          </View>
        </View>

        <View testID="network-live-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Live network state</Text>
          </View>
          <View className="capability-row">
            <Text className="capability-label">Type</Text>
            <Text className="value-text">{networkTypeLabel(networkState.type)}</Text>
          </View>
          <View className="capability-row">
            <Text className="capability-label">Connected</Text>
            <Text className="value-text">{networkState.isConnected === undefined ? 'checking…' : networkState.isConnected ? 'Yes' : 'No'}</Text>
          </View>
          <View className="capability-row">
            <Text className="capability-label">Internet reachable</Text>
            <Text className="value-text">
              {networkState.isInternetReachable === undefined ? 'checking…' : networkState.isInternetReachable ? 'Yes' : 'No'}
            </Text>
          </View>
        </View>

        <View testID="network-info-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Device info</Text>
          </View>
          <View className="capability-row">
            <Text className="capability-label">IP address</Text>
            <Text className="value-text">{ipAddress === null ? 'checking…' : ipAddress}</Text>
          </View>
          <View className="capability-row">
            <Text className="capability-label">Airplane mode</Text>
            <Text className="value-text">{isAirplaneMode === null ? 'checking…' : isAirplaneMode ? 'On' : 'Off'}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
