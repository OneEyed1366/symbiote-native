import { Component, inject, signal } from '@angular/core';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from '@symbiote-native/angular';
import {
  BatteryLevelService,
  BatteryState,
  BatteryStateService,
  LowPowerModeService,
  isAvailableAsync,
  isBatteryOptimizationEnabledAsync,
} from '@symbiote-native/battery/angular';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function formatBatteryState(state: BatteryState): string {
  switch (state) {
    case BatteryState.CHARGING:
      return 'Charging';
    case BatteryState.FULL:
      return 'Full';
    case BatteryState.UNPLUGGED:
      return 'Unplugged';
    case BatteryState.NOT_CHARGING:
      return 'Not charging';
    default:
      return 'Unknown';
  }
}

/**
 * @symbiote-native/battery canary demo: a live-status card (battery level, charging state, low
 * power mode) backed by the three Angular services' connect() signals, plus a device-info card
 * with the one-shot isAvailableAsync()/isBatteryOptimizationEnabledAsync() checks. The iOS
 * Simulator reports the battery API as unavailable — expected, not a bug. Angular twin of
 * ../../react/screens/BatteryScreen.tsx, same three-service connect() shape as
 * @symbiote-native/sensors' per-sensor services.
 */
@Component({
  selector: 'BatteryScreen',
  standalone: true,
  imports: [SafeAreaView, ScrollView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView
        testID="battery-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">{{ heroBadgeCode }}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Battery</Text>
            <Text class="hero-body">
              @symbiote-native/battery — live battery level, charging state, and
              Low Power/Power Saver mode. The iOS Simulator reports the battery
              API as unavailable; a real device is needed to see live values.
            </Text>
          </View>
        </View>

        <View testID="battery-status-card" class="capability-card">
          <Text class="capability-card-title">Live status</Text>
          <View testID="battery-level" class="capability-row">
            <Text class="capability-label">Battery level</Text>
            <Text class="value-text">{{ batteryLevelLabel() }}</Text>
          </View>
          <View testID="battery-state" class="capability-row">
            <Text class="capability-label">State</Text>
            <Text class="value-text">{{ batteryStateLabel() }}</Text>
          </View>
          <View testID="battery-low-power-mode" class="capability-row">
            <Text class="capability-label">Low power mode</Text>
            <View [class]="statusBadgeClass(lowPowerModeStatus())">
              <Text class="status-badge-text">{{
                statusLabel(lowPowerModeStatus())
              }}</Text>
            </View>
          </View>
        </View>

        <View testID="battery-info-card" class="capability-card">
          <Text class="capability-card-title">Device info</Text>
          <View testID="battery-available" class="capability-row">
            <Text class="capability-label">Available</Text>
            <View [class]="statusBadgeClass(isAvailable())">
              <Text class="status-badge-text">{{
                statusLabel(isAvailable())
              }}</Text>
            </View>
          </View>
          @if (Platform.OS === 'android') {
            <View testID="battery-optimization" class="capability-row">
              <Text class="capability-label">Battery optimization enabled</Text>
              <View [class]="statusBadgeClass(batteryOptimizationEnabled())">
                <Text class="status-badge-text">{{
                  statusLabel(batteryOptimizationEnabled())
                }}</Text>
              </View>
            </View>
          }
        </View>
      </ScrollView>
    </SafeAreaView>
  `,
})
export class BatteryScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Battery];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly Platform = Platform;

  readonly batteryLevel = inject(BatteryLevelService).connect();
  readonly batteryState = inject(BatteryStateService).connect();
  readonly lowPowerMode = inject(LowPowerModeService).connect();

  readonly isAvailable = signal<ICapabilityStatus>('checking');
  readonly batteryOptimizationEnabled = signal<ICapabilityStatus>('checking');

  constructor() {
    isAvailableAsync().then(value =>
      this.isAvailable.set(toCapabilityStatus(value)),
    );
    if (Platform.OS === 'android') {
      isBatteryOptimizationEnabledAsync().then(value =>
        this.batteryOptimizationEnabled.set(toCapabilityStatus(value)),
      );
    }
  }

  batteryLevelLabel(): string {
    const level = this.batteryLevel();
    return level < 0 ? 'unknown' : `${Math.round(level * 100)}%`;
  }

  batteryStateLabel(): string {
    return formatBatteryState(this.batteryState());
  }

  lowPowerModeStatus(): ICapabilityStatus {
    return toCapabilityStatus(this.lowPowerMode());
  }

  statusBadgeClass(status: ICapabilityStatus): string {
    return `status-badge status-badge-${status}`;
  }

  statusLabel(status: ICapabilityStatus): string {
    return status === 'checking'
      ? 'CHECKING…'
      : status === 'yes'
        ? 'YES'
        : 'NO';
  }
}
