import { Component, inject, signal } from '@angular/core';
import {
  Platform,
  SafeAreaViewElement,
  ScrollViewElement,
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
  imports: [SafeAreaViewElement, ScrollViewElement, Text, View],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="battery-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">{{ heroBadgeCode }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Battery</text>
            <text class="hero-body">
              @symbiote-native/battery — live battery level, charging state, and
              Low Power/Power Saver mode. The iOS Simulator reports the battery
              API as unavailable; a real device is needed to see live values.
            </text>
          </view>
        </view>

        <view testID="battery-status-card" class="capability-card">
          <text class="capability-card-title">Live status</text>
          <view testID="battery-level" class="capability-row">
            <text class="capability-label">Battery level</text>
            <text class="value-text">{{ batteryLevelLabel() }}</text>
          </view>
          <view testID="battery-state" class="capability-row">
            <text class="capability-label">State</text>
            <text class="value-text">{{ batteryStateLabel() }}</text>
          </view>
          <view testID="battery-low-power-mode" class="capability-row">
            <text class="capability-label">Low power mode</text>
            <view [class]="statusBadgeClass(lowPowerModeStatus())">
              <text class="status-badge-text">{{
                statusLabel(lowPowerModeStatus())
              }}</text>
            </view>
          </view>
        </view>

        <view testID="battery-info-card" class="capability-card">
          <text class="capability-card-title">Device info</text>
          <view testID="battery-available" class="capability-row">
            <text class="capability-label">Available</text>
            <view [class]="statusBadgeClass(isAvailable())">
              <text class="status-badge-text">{{
                statusLabel(isAvailable())
              }}</text>
            </view>
          </view>
          @if (Platform.OS === 'android') {
            <view testID="battery-optimization" class="capability-row">
              <text class="capability-label">Battery optimization enabled</text>
              <view [class]="statusBadgeClass(batteryOptimizationEnabled())">
                <text class="status-badge-text">{{
                  statusLabel(batteryOptimizationEnabled())
                }}</text>
              </view>
            </view>
          }
        </view>
      </scroll-view>
    </safe-area-view>
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
