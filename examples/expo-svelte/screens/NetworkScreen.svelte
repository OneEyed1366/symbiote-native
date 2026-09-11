<script lang="ts">
  // @symbiote-native/network tour stop — a live network-state card driven by useNetworkState()
  // (seeded via getNetworkStateAsync(), refreshed by addNetworkStateListener()) plus a one-shot card
  // for the IP address and airplane-mode check. Toggle Wi-Fi/airplane mode on the device to see the
  // live card update on its own. Svelte twin of examples/expo-vue-sfc/screens/NetworkScreen.vue.
  import { ScrollView } from '@symbiote-native/svelte';
  import {
    NetworkStateType,
    getIpAddressAsync,
    isAirplaneModeEnabledAsync,
    useNetworkState,
  } from '@symbiote-native/network/svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

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
  let ipAddress = $state<string | null>(null);
  let isAirplaneMode = $state<boolean | null>(null);

  // Re-fetch alongside every live network-state change, mirroring the React screen's
  // useEffect(..., [networkState]) — a Wi-Fi/airplane-mode toggle should refresh both cards
  // together, not just the live one. The bare read below is what registers that dependency; the
  // two assignments are write-only and cannot re-trigger the effect.
  $effect(() => {
    void networkState.current;
    void Promise.all([getIpAddressAsync(), isAirplaneModeEnabledAsync()]).then(
      ([currentIp, isEnabled]) => {
        ipAddress = currentIp;
        isAirplaneMode = isEnabled;
      },
    );
  });

  const networkTypeText = $derived(networkTypeLabel(networkState.current.type));
  const isConnectedText = $derived(
    yesNoLabel(networkState.current.isConnected),
  );
  const isInternetReachableText = $derived(
    yesNoLabel(networkState.current.isInternetReachable),
  );
  const ipAddressText = $derived(
    ipAddress === null ? PENDING_LABEL : ipAddress,
  );
  const airplaneModeText = $derived(airplaneModeLabel(isAirplaneMode));
</script>

<safe-area-view class="screen">
  <ScrollView
    testID="network-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: lineColor }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">Network</text>
        <text class="hero-body">
          @symbiote-native/network — live network state via useNetworkState(),
          plus the device's IP address and airplane-mode check. Toggle Wi-Fi or
          airplane mode on the device to see the live card update on its own.
        </text>
      </view>
    </view>
    <view testID="network-live-card" class="network-card">
      <text class="network-card-title">Live network state</text>
      <view class="network-row">
        <text class="network-row-label">Type</text>
        <text testID="network-type-value" class="network-value-text">
          {networkTypeText}
        </text>
      </view>
      <view class="network-row">
        <text class="network-row-label">Connected</text>
        <text testID="network-connected-value" class="network-value-text">
          {isConnectedText}
        </text>
      </view>
      <view class="network-row">
        <text class="network-row-label">Internet reachable</text>
        <text testID="network-reachable-value" class="network-value-text">
          {isInternetReachableText}
        </text>
      </view>
    </view>
    <view testID="network-info-card" class="network-card">
      <text class="network-card-title">Device info</text>
      <view class="network-row">
        <text class="network-row-label">IP address</text>
        <text testID="network-ip-value" class="network-value-text">
          {ipAddressText}
        </text>
      </view>
      <view class="network-row">
        <text class="network-row-label">Airplane mode</text>
        <text testID="network-airplane-value" class="network-value-text">
          {airplaneModeText}
        </text>
      </view>
    </view>
  </ScrollView>
</safe-area-view>
