import { Component, signal } from '@angular/core';
import {
  SafeAreaViewElement,
  ScrollViewElement,
  Text,
  View,
} from '@symbiote-native/angular';
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
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const BYTES_PER_UNIT = 1024;
const MEMORY_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return 'unknown';
  }
  if (bytes === 0) {
    return '0 B';
  }
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(BYTES_PER_UNIT)),
    MEMORY_SIZE_UNITS.length - 1,
  );
  const value = bytes / Math.pow(BYTES_PER_UNIT, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : 2)} ${MEMORY_SIZE_UNITS[exponent]}`;
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

/**
 * @symbiote-native/device canary demo: a device-info card of eagerly-resolved constants (brand,
 * model, OS, memory, …), followed by three buttons exercising the one-shot async functions
 * (getDeviceTypeAsync/getUptimeAsync/isRootedExperimentalAsync). Every constant/function is a
 * plain re-export off the core package — no service to inject(), same shape as
 * @symbiote-native/local-auth's plain-function surface. Angular twin of
 * ../../react/screens/DeviceScreen.tsx.
 */
@Component({
  selector: 'DeviceScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaViewElement, ScrollViewElement, Text, View],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="device-scroll"
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
            <text class="hero-title">Device</text>
            <text class="hero-body">
              @symbiote-native/device — brand/model/OS constants, total memory,
              and best-effort root/jailbreak detection.
            </text>
          </view>
        </view>

        <view testID="device-info-card" class="capability-card">
          <text class="capability-card-title">Device info</text>
          <view testID="device-is-device" class="capability-row">
            <text class="capability-label">Is device</text>
            <text class="value-text">{{ isDevice ? 'Yes' : 'No' }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Brand</text>
            <text class="value-text">{{ brand ?? 'unknown' }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Manufacturer</text>
            <text class="value-text">{{ manufacturer ?? 'unknown' }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Model</text>
            <text class="value-text">{{ modelName ?? 'unknown' }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Device type</text>
            <text class="value-text">{{ staticDeviceTypeLabel }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">OS</text>
            <text class="value-text"
              >{{ osName ?? 'unknown' }} {{ osVersion ?? '' }}</text
            >
          </view>
          <view class="capability-row">
            <text class="capability-label">Total memory</text>
            <text class="value-text">{{ totalMemoryLabel }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Device name</text>
            <text class="value-text">{{ deviceName ?? 'unknown' }}</text>
          </view>
        </view>

        <view testID="device-checks-card" class="capability-card">
          <text class="capability-card-title">Live checks</text>
          <ActionButton
            testID="device-get-type-button"
            title="Get device type"
            (press)="handleGetDeviceType()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="device-type-result" class="value-text">{{
            deviceTypeResultLabel()
          }}</text>

          <ActionButton
            testID="device-get-uptime-button"
            title="Get uptime"
            (press)="handleGetUptime()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="device-uptime-result" class="value-text">{{
            uptimeResultLabel()
          }}</text>

          <ActionButton
            testID="device-check-rooted-button"
            title="Check root/jailbreak"
            (press)="handleCheckRooted()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="device-rooted-result" class="value-text">{{
            isRootedResultLabel()
          }}</text>
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class DeviceScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Device];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly isDevice = isDevice;
  readonly brand = brand;
  readonly manufacturer = manufacturer;
  readonly modelName = modelName;
  readonly osName = osName;
  readonly osVersion = osVersion;
  readonly deviceName = deviceName;
  readonly staticDeviceTypeLabel = deviceTypeLabel(deviceType);
  readonly totalMemoryLabel = formatBytes(totalMemory);

  readonly deviceTypeResult = signal<DeviceType | null>(null);
  readonly uptimeResult = signal<number | null>(null);
  readonly isRootedResult = signal<boolean | null>(null);

  handleGetDeviceType(): void {
    getDeviceTypeAsync().then(value => this.deviceTypeResult.set(value));
  }

  handleGetUptime(): void {
    getUptimeAsync().then(value => this.uptimeResult.set(value));
  }

  handleCheckRooted(): void {
    isRootedExperimentalAsync().then(value => this.isRootedResult.set(value));
  }

  // Plain methods rather than `@if (signal(); as x)` — DeviceType.UNKNOWN is 0 and a resolved
  // uptime/rooted check can legitimately be 0/false, both falsy, so the template control-flow
  // sugar would wrongly read a real result as "not checked yet" (same trap as
  // ../screens/LocalAuthScreen.ts's enrolledLevelLabel()).
  deviceTypeResultLabel(): string {
    const type = this.deviceTypeResult();
    return type === null ? 'not checked yet' : deviceTypeLabel(type);
  }

  uptimeResultLabel(): string {
    const uptime = this.uptimeResult();
    return uptime === null ? 'not checked yet' : `${uptime}ms`;
  }

  isRootedResultLabel(): string {
    const isRooted = this.isRootedResult();
    return isRooted === null ? 'not checked yet' : String(isRooted);
  }
}
