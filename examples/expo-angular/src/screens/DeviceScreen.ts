import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  DeviceType,
  brand,
  deviceName,
  deviceType,
  getDeviceTypeAsync,
  getUptimeAsync,
  isDevice,
  isRootedExperimentalAsync,
  manufacturer,
  modelName,
  osName,
  osVersion,
  totalMemory,
} from '@symbiote-native/device/angular';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ValueRow } from './ValueRow';

const BYTES_PER_UNIT = 1024;
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
type ISizeUnit = (typeof SIZE_UNITS)[number];
const UNKNOWN_LABEL = 'unknown';

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return UNKNOWN_LABEL;
  }
  let value = bytes;
  let unitIndex = 0;
  while (value >= BYTES_PER_UNIT && unitIndex < SIZE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unitIndex += 1;
  }
  const unit: ISizeUnit = SIZE_UNITS[unitIndex];
  const precision = unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${unit}`;
}

function deviceTypeLabel(type: DeviceType | null): string {
  switch (type) {
    case DeviceType.PHONE:
      return 'Phone';
    case DeviceType.TABLET:
      return 'Tablet';
    case DeviceType.DESKTOP:
      return 'Desktop';
    case DeviceType.TV:
      return 'TV';
    default:
      return 'Unknown';
  }
}

@Component({
  selector: 'DeviceScreen',
  standalone: true,
  imports: [ActionButton, Scenario, SYMBIOTE_ELEMENTS, ValueRow],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="device-scroll"
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
            <text class="hero-title">Device</text>
            <text class="hero-body">
              Know what the app runs on: brand, model, OS version, memory,
              device type, uptime and whether the phone is rooted or jailbroken.
              Use it to adapt layouts, log bug reports and gate risky features.
            </text>
          </view>
        </view>

        <Scenario
          testID="device-scenario"
          title="Attach device details to a bug report or adapt to a tablet"
          why="Support tickets are far easier to solve with the model and OS version attached, and a tablet or a low-memory phone may need a different layout or lighter images."
          [steps]="scenarioSteps"
          expect="Model, OS and memory match the phone in your hand. The simulator reports Is real device as No, and the root check returns false on a normal phone."
        />

        <view testID="device-constants-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Constants</text>
          </view>
          <ValueRow label="Is real device" [value]="isDevice ? 'Yes' : 'No'" />
          <ValueRow label="Brand" [value]="brand" />
          <ValueRow label="Manufacturer" [value]="manufacturer" />
          <ValueRow label="Model" [value]="modelName" />
          <ValueRow label="Device type" [value]="deviceKind" />
          <ValueRow label="OS" [value]="osLabel" />
          <ValueRow label="OS version" [value]="osVersionLabel" />
          <ValueRow label="Total memory" [value]="memory" />
          <ValueRow label="Device name" [value]="name" />
        </view>

        <view testID="device-async-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Async checks</text>
          </view>
          <ActionButton
            testID="device-type-button"
            title="Get device type"
            [color]="lineColor"
            (press)="getDeviceType()"
          />
          @if (asyncDeviceType(); as value) {
            <ValueRow label="Device type (async)" [value]="value" />
          }
          <ActionButton
            testID="device-uptime-button"
            title="Get uptime"
            [color]="lineColor"
            (press)="getUptime()"
          />
          @if (uptime() !== null) {
            <ValueRow label="Uptime" [value]="uptime() + 'ms'" />
          }
          <ActionButton
            testID="device-rooted-button"
            title="Check rooted/jailbroken"
            [color]="lineColor"
            (press)="checkRooted()"
          />
          @if (isRooted() !== null) {
            <ValueRow
              label="Rooted/jailbroken"
              [value]="isRooted() ? 'true' : 'false'"
            />
          }
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class DeviceScreen {
  readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Device];
  readonly lineColor = LINE_COLOR.device;
  readonly badgeStyle = { backgroundColor: LINE_COLOR.device };
  readonly scenarioSteps = [
    'Read the constants card',
    'Press the async checks for device type, uptime and root detection',
  ];

  readonly isDevice = isDevice;
  readonly brand = brand ?? UNKNOWN_LABEL;
  readonly manufacturer = manufacturer ?? UNKNOWN_LABEL;
  readonly modelName = modelName ?? UNKNOWN_LABEL;
  readonly deviceKind = deviceTypeLabel(deviceType);
  readonly osLabel = osName ?? UNKNOWN_LABEL;
  readonly osVersionLabel = osVersion ?? UNKNOWN_LABEL;
  readonly memory = formatBytes(totalMemory);
  readonly name = deviceName ?? UNKNOWN_LABEL;

  readonly asyncDeviceType = signal<string | null>(null);
  readonly uptime = signal<number | null>(null);
  readonly isRooted = signal<boolean | null>(null);

  getDeviceType(): void {
    void getDeviceTypeAsync().then(value =>
      this.asyncDeviceType.set(deviceTypeLabel(value)),
    );
  }

  getUptime(): void {
    void getUptimeAsync().then(value => this.uptime.set(value));
  }

  checkRooted(): void {
    void isRootedExperimentalAsync().then(value => this.isRooted.set(value));
  }
}
