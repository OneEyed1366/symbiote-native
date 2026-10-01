<script lang="ts">
  import {
    NetworkStateType,
    getIpAddressAsync,
    isAirplaneModeEnabledAsync,
    useNetworkState,
  } from '@symbiote-native/network/svelte';
  import Scenario from '../components/Scenario.svelte';
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

  // The bare read of `networkState.current` re-runs the lookups on every live state change
  $effect(() => {
    void networkState.current;
    let isCurrent = true;
    void Promise.all([getIpAddressAsync(), isAirplaneModeEnabledAsync()]).then(
      ([ip, airplaneMode]) => {
        if (isCurrent) {
          ipAddress = ip;
          isAirplaneMode = airplaneMode;
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  });
</script>

{#snippet infoRow(label: string, value: string)}
  <view class="capability-row">
    <text class="capability-label">{label}</text>
    <text class="value-text">{value}</text>
  </view>
{/snippet}

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
          React to connectivity: the connection type, whether the internet is
          reachable, the device IP address and airplane mode, updating live as
          the network changes.
        </text>
      </view>
    </view>

    <Scenario
      testID="network-scenario"
      title="Show an offline banner and queue work until the network is back"
      why="Tell users when they are offline instead of letting requests fail silently, and retry uploads when the connection returns. Connected does not always mean the internet is reachable."
      steps={[
        'Turn Wi-Fi off, then airplane mode on',
        'Watch the live card',
        'Turn everything back on',
      ]}
      expect="Type, connected and internet reachable change within a moment each time, and airplane mode reads Yes while it is on."
    />

    <view testID="network-live-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Live network state</text>
      </view>
      {@render infoRow('Type', networkTypeLabel(networkState.current.type))}
      {@render infoRow('Connected', yesNoLabel(networkState.current.isConnected))}
      {@render infoRow(
        'Internet reachable',
        yesNoLabel(networkState.current.isInternetReachable),
      )}
    </view>

    <view testID="network-info-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Device info</text>
      </view>
      {@render infoRow('IP address', ipAddress === null ? PENDING_LABEL : ipAddress)}
      {@render infoRow('Airplane mode', airplaneModeLabel(isAirplaneMode))}
    </view>
  </scroll-view>
</safe-area-view>
