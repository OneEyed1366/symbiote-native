import { Component, effect, inject, signal } from '@angular/core';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/angular';
import {
  NetworkStateService,
  NetworkStateType,
  getIpAddressAsync,
  isAirplaneModeEnabledAsync,
} from '@symbiote-native/network/angular';
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

function yesNoLabel(value: boolean | undefined): string {
  return value === undefined ? 'checking…' : value ? 'Yes' : 'No';
}

/**
 * @symbiote-native/network canary demo: a live network-state card driven by
 * NetworkStateService.connect() (seeded via getNetworkStateAsync(), refreshed by
 * addNetworkStateListener()) plus a one-shot card for the IP address and airplane-mode check,
 * re-fetched whenever the live state changes. Angular twin of
 * ../../react/screens/NetworkScreen.tsx. Toggle Wi-Fi/airplane mode on the device to see the
 * live card update on its own.
 */
@Component({
  selector: 'NetworkScreen',
  standalone: true,
  imports: [SafeAreaView, ScrollView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView testID="network-scroll" class="screen" contentContainerStyle="scroll-content">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">{{ heroBadgeCode }}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Network</Text>
            <Text class="hero-body">
              @symbiote-native/network — live network state via NetworkStateService, plus the
              device's IP address and airplane-mode check. Toggle Wi-Fi or airplane mode on the
              device to see the live card update on its own.
            </Text>
          </View>
        </View>

        <View testID="network-live-card" class="capability-card">
          <Text class="capability-card-title">Live network state</Text>
          <View class="capability-row">
            <Text class="capability-label">Type</Text>
            <Text class="value-text">{{ networkTypeLabel() }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Connected</Text>
            <Text class="value-text">{{ connectedLabel() }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Internet reachable</Text>
            <Text class="value-text">{{ internetReachableLabel() }}</Text>
          </View>
        </View>

        <View testID="network-info-card" class="capability-card">
          <Text class="capability-card-title">Device info</Text>
          <View class="capability-row">
            <Text class="capability-label">IP address</Text>
            <Text class="value-text">{{ ipAddressLabel() }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Airplane mode</Text>
            <Text class="value-text">{{ airplaneModeLabel() }}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  `,
})
export class NetworkScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Network];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly networkState = inject(NetworkStateService).connect();

  readonly ipAddress = signal<string | null>(null);
  readonly isAirplaneMode = signal<boolean | null>(null);

  constructor() {
    effect(() => {
      this.networkState();
      Promise.all([getIpAddressAsync(), isAirplaneModeEnabledAsync()]).then(([ip, airplaneMode]) => {
        this.ipAddress.set(ip);
        this.isAirplaneMode.set(airplaneMode);
      });
    });
  }

  networkTypeLabel(): string {
    return networkTypeLabel(this.networkState().type);
  }

  connectedLabel(): string {
    return yesNoLabel(this.networkState().isConnected);
  }

  internetReachableLabel(): string {
    return yesNoLabel(this.networkState().isInternetReachable);
  }

  ipAddressLabel(): string {
    const ip = this.ipAddress();
    return ip === null ? 'checking…' : ip;
  }

  airplaneModeLabel(): string {
    const airplaneMode = this.isAirplaneMode();
    return airplaneMode === null ? 'checking…' : airplaneMode ? 'On' : 'Off';
  }
}
