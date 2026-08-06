import { Component, signal } from '@angular/core';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/angular';
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
  imports: [ActionButton, SafeAreaView, ScrollView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView testID="device-scroll" class="screen" contentContainerStyle="scroll-content">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">{{ heroBadgeCode }}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Device</Text>
            <Text class="hero-body">
              @symbiote-native/device — brand/model/OS constants, total memory, and best-effort
              root/jailbreak detection.
            </Text>
          </View>
        </View>

        <View testID="device-info-card" class="capability-card">
          <Text class="capability-card-title">Device info</Text>
          <View testID="device-is-device" class="capability-row">
            <Text class="capability-label">Is device</Text>
            <Text class="value-text">{{ isDevice ? 'Yes' : 'No' }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Brand</Text>
            <Text class="value-text">{{ brand ?? 'unknown' }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Manufacturer</Text>
            <Text class="value-text">{{ manufacturer ?? 'unknown' }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Model</Text>
            <Text class="value-text">{{ modelName ?? 'unknown' }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Device type</Text>
            <Text class="value-text">{{ staticDeviceTypeLabel }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">OS</Text>
            <Text class="value-text">{{ osName ?? 'unknown' }} {{ osVersion ?? '' }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Total memory</Text>
            <Text class="value-text">{{ totalMemoryLabel }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Device name</Text>
            <Text class="value-text">{{ deviceName ?? 'unknown' }}</Text>
          </View>
        </View>

        <View testID="device-checks-card" class="capability-card">
          <Text class="capability-card-title">Live checks</Text>
          <ActionButton
            testID="device-get-type-button"
            title="Get device type"
            (press)="handleGetDeviceType()"
            [color]="lineColor"
          ></ActionButton>
          <Text testID="device-type-result" class="value-text">{{ deviceTypeResultLabel() }}</Text>

          <ActionButton
            testID="device-get-uptime-button"
            title="Get uptime"
            (press)="handleGetUptime()"
            [color]="lineColor"
          ></ActionButton>
          <Text testID="device-uptime-result" class="value-text">{{ uptimeResultLabel() }}</Text>

          <ActionButton
            testID="device-check-rooted-button"
            title="Check root/jailbreak"
            (press)="handleCheckRooted()"
            [color]="lineColor"
          ></ActionButton>
          <Text testID="device-rooted-result" class="value-text">{{ isRootedResultLabel() }}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
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
