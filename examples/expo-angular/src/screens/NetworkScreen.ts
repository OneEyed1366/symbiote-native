import { Component, effect, inject, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  NetworkStateService,
  NetworkStateType,
  getIpAddressAsync,
  isAirplaneModeEnabledAsync,
} from '@symbiote-native/network/angular';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ValueRow } from './ValueRow';

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

@Component({
  selector: 'NetworkScreen',
  standalone: true,
  imports: [Scenario, SYMBIOTE_ELEMENTS, ValueRow],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="network-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="'line-tag line-tag-' + lineInfo.line">
          <text class="line-tag-text"
            >{{ lineInfo.code }} · {{ lineInfo.label }}</text
          >
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="badgeStyle">
            <text class="hero-badge-text">{{ lineInfo.code }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Network</text>
            <text class="hero-body">
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
          [steps]="scenarioSteps"
          expect="Type, connected and internet reachable change within a moment each time, and airplane mode reads Yes while it is on."
        />

        <view testID="network-live-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Live network state</text>
          </view>
          <ValueRow label="Type" [value]="typeLabel(networkState().type)" />
          <ValueRow
            label="Connected"
            [value]="yesNo(networkState().isConnected)"
          />
          <ValueRow
            label="Internet reachable"
            [value]="yesNo(networkState().isInternetReachable)"
          />
        </view>

        <view testID="network-info-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Device info</text>
          </view>
          <ValueRow label="IP address" [value]="ipAddress() ?? pendingLabel" />
          <ValueRow
            label="Airplane mode"
            [value]="airplaneLabel(isAirplaneMode())"
          />
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class NetworkScreen {
  readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Network];
  readonly badgeStyle = { backgroundColor: LINE_COLOR.network };
  readonly typeLabel = networkTypeLabel;
  readonly yesNo = yesNoLabel;
  readonly airplaneLabel = airplaneModeLabel;
  readonly pendingLabel = PENDING_LABEL;
  readonly scenarioSteps = [
    'Turn Wi-Fi off, then airplane mode on',
    'Watch the live card',
    'Turn everything back on',
  ];

  readonly networkState = inject(NetworkStateService).connect();
  readonly ipAddress = signal<string | null>(null);
  readonly isAirplaneMode = signal<boolean | null>(null);

  constructor() {
    // The bare read of `networkState()` re-runs the lookups on every live state change
    effect(onCleanup => {
      this.networkState();
      let isCurrent = true;
      onCleanup(() => {
        isCurrent = false;
      });
      void Promise.all([
        getIpAddressAsync(),
        isAirplaneModeEnabledAsync(),
      ]).then(([ip, airplaneMode]) => {
        if (isCurrent) {
          this.ipAddress.set(ip);
          this.isAirplaneMode.set(airplaneMode);
        }
      });
    });
  }
}
