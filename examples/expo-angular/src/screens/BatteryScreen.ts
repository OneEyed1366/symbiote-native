import { Component, computed, inject, signal } from '@angular/core';
import { Platform, SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  BatteryLevelService,
  BatteryState,
  BatteryStateService,
  LowPowerModeService,
  isAvailableAsync,
  isBatteryOptimizationEnabledAsync,
} from '@symbiote-native/battery/angular';
import { Scenario } from '../components/Scenario';
import { toCapabilityStatus } from '../components/capability-status';
import type { ICapabilityStatus } from '../components/capability-status';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { CapabilityRow } from './CapabilityRow';
import { ValueRow } from './ValueRow';

const MIN_MEASURABLE_LEVEL = 0;
const PERCENT_SCALE = 100;
const ANDROID_OS = 'android';

function batteryStateLabel(state: BatteryState): string {
  switch (state) {
    case BatteryState.CHARGING:
      return 'Charging';
    case BatteryState.FULL:
      return 'Full';
    case BatteryState.UNPLUGGED:
      return 'Unplugged';
    case BatteryState.NOT_CHARGING:
      return 'Not charging (protecting battery)';
    default:
      return 'Unknown';
  }
}

@Component({
  selector: 'BatteryScreen',
  standalone: true,
  imports: [CapabilityRow, Scenario, SYMBIOTE_ELEMENTS, ValueRow],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="battery-scroll"
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
            <text class="hero-title">Battery</text>
            <text class="hero-body">
              React to the battery: level, charging state and low-power mode
              update live through hooks, so the app can pause heavy work when
              the battery is low. A simulator reports the API as unavailable,
              use a real device.
            </text>
          </view>
        </view>

        <Scenario
          testID="battery-scenario"
          title="Pause sync and animations when the battery is low"
          why="Skip background uploads, heavy animations or video quality when the user is on low power or unplugged at low charge, and resume when they plug in."
          [steps]="scenarioSteps"
          expect="Level, charging state and low power mode change on screen within a moment, without reloading."
        />

        <view testID="battery-live-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Live status</text>
          </view>
          <ValueRow label="Battery level" [value]="batteryLevelText()" />
          <ValueRow label="Battery state" [value]="batteryStateText()" />
          <ValueRow
            label="Low power mode"
            [value]="lowPowerMode() ? 'On' : 'Off'"
          />
        </view>

        <view testID="battery-capabilities-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Capabilities</text>
          </view>
          <CapabilityRow
            testID="battery-available"
            label="Available"
            [status]="availabilityStatus()"
          />
          @if (isAndroid) {
            <CapabilityRow
              testID="battery-optimization"
              label="Battery optimization enabled"
              [status]="optimizationStatus()"
            />
          }
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class BatteryScreen {
  readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Battery];
  readonly badgeStyle = { backgroundColor: LINE_COLOR.battery };
  readonly isAndroid = Platform.OS === ANDROID_OS;
  readonly scenarioSteps = [
    'Turn Low Power Mode on in the system settings',
    'Plug the charger in and out',
    'Watch the live status card',
  ];

  private readonly batteryLevel = inject(BatteryLevelService).connect();
  private readonly batteryState = inject(BatteryStateService).connect();
  readonly lowPowerMode = inject(LowPowerModeService).connect();

  readonly availabilityStatus = signal<ICapabilityStatus>('checking');
  readonly optimizationStatus = signal<ICapabilityStatus>('checking');

  readonly batteryLevelText = computed(() =>
    this.batteryLevel() < MIN_MEASURABLE_LEVEL
      ? 'unknown'
      : `${Math.round(this.batteryLevel() * PERCENT_SCALE)}%`,
  );
  readonly batteryStateText = computed(() =>
    batteryStateLabel(this.batteryState()),
  );

  constructor() {
    void isAvailableAsync().then(isSupported => {
      this.availabilityStatus.set(toCapabilityStatus(isSupported));
    });
    if (this.isAndroid) {
      void isBatteryOptimizationEnabledAsync().then(isEnabled => {
        this.optimizationStatus.set(toCapabilityStatus(isEnabled));
      });
    }
  }
}
