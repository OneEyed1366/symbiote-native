import { Component, inject, signal } from '@angular/core';
import { Platform, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/angular';
import {
  BrightnessMode,
  PermissionsService,
  addBrightnessListener,
  getBrightnessAsync,
  getSystemBrightnessModeAsync,
  isUsingSystemBrightnessAsync,
  restoreSystemBrightnessAsync,
  setBrightnessAsync,
  setSystemBrightnessModeAsync,
} from '@symbiote-native/brightness/angular';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function formatBrightnessMode(mode: BrightnessMode): string {
  switch (mode) {
    case BrightnessMode.AUTOMATIC:
      return 'Automatic';
    case BrightnessMode.MANUAL:
      return 'Manual';
    default:
      return 'Unknown';
  }
}

const BRIGHTNESS_STEPS: readonly { label: string; value: number }[] = [
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1 },
];

/**
 * @symbiote-native/brightness canary demo: a live brightness card (seeded via
 * getBrightnessAsync(), refreshed by addBrightnessListener() — iOS-only upstream, so on Android
 * the value only changes via the buttons below), a set-brightness action row, an Android-only
 * system-brightness-mode card, and a permission card driving PermissionsService. Angular twin of
 * ../../react/screens/BrightnessScreen.tsx. No Angular service wraps the one-off brightness
 * listener (unlike battery's three services) — wired directly here via signal(), mirroring
 * BatteryScreen's constructor pattern; the subscription stays live for the component's lifetime
 * (no screen in this app implements OnDestroy to unsubscribe one, same as upstream Expo demos).
 */
@Component({
  selector: 'BrightnessScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaView, ScrollView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView testID="brightness-scroll" class="screen" contentContainerStyle="scroll-content">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">{{ heroBadgeCode }}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Brightness</Text>
            <Text class="hero-body">
              @symbiote-native/brightness — screen brightness get/set, Android system-brightness
              mode, and an iOS-only live listener. Requires SYSTEM_BRIGHTNESS permission on
              Android before setting the system-wide value.
            </Text>
          </View>
        </View>

        <View testID="brightness-live-card" class="capability-card">
          <Text class="capability-card-title">Live brightness</Text>
          <View class="capability-row">
            <Text class="capability-label">Screen brightness</Text>
            <Text class="value-text">{{ brightnessLabel() }}</Text>
          </View>
          <View class="button-row">
            @for (step of brightnessSteps; track step.label) {
              <ActionButton
                [testID]="'brightness-set-' + step.label"
                [title]="step.label"
                [color]="lineColor"
                (press)="handleSetBrightness(step.value)"
              ></ActionButton>
            }
          </View>
        </View>

        @if (Platform.OS === 'android') {
          <View testID="brightness-system-card" class="capability-card">
            <Text class="capability-card-title">System brightness (Android only)</Text>
            <View class="capability-row">
              <Text class="capability-label">Mode</Text>
              <Text class="value-text">{{ systemModeLabel() }}</Text>
            </View>
            <View testID="brightness-using-system" class="capability-row">
              <Text class="capability-label">Using system value</Text>
              <View [class]="statusBadgeClass(isUsingSystem())">
                <Text class="status-badge-text">{{ statusLabel(isUsingSystem()) }}</Text>
              </View>
            </View>
            <View class="button-row">
              <ActionButton
                testID="brightness-mode-automatic"
                title="Automatic"
                [color]="lineColor"
                (press)="handleSetSystemMode(BrightnessMode.AUTOMATIC)"
              ></ActionButton>
              <ActionButton
                testID="brightness-mode-manual"
                title="Manual"
                [color]="lineColor"
                (press)="handleSetSystemMode(BrightnessMode.MANUAL)"
              ></ActionButton>
              <ActionButton
                testID="brightness-restore-system"
                title="Restore system"
                [color]="lineColor"
                (press)="handleRestoreSystem()"
              ></ActionButton>
            </View>
          </View>
        }

        <View testID="brightness-permission-card" class="capability-card">
          <Text class="capability-card-title">Permission</Text>
          <View class="capability-row">
            <Text class="capability-label">SYSTEM_BRIGHTNESS status</Text>
            <Text class="value-text">{{ permissionLabel() }}</Text>
          </View>
          <ActionButton
            testID="brightness-request-permission"
            title="Request permission"
            [color]="lineColor"
            (press)="requestPermission()"
          ></ActionButton>
        </View>
      </ScrollView>
    </SafeAreaView>
  `,
})
export class BrightnessScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Brightness];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly Platform = Platform;
  readonly BrightnessMode = BrightnessMode;
  readonly brightnessSteps = BRIGHTNESS_STEPS;

  private readonly permissionsService = inject(PermissionsService);
  readonly permissionStatus = this.permissionsService.connect();

  readonly brightness = signal<number | null>(null);
  readonly systemMode = signal<BrightnessMode>(BrightnessMode.UNKNOWN);
  readonly isUsingSystem = signal<ICapabilityStatus>('checking');

  constructor() {
    getBrightnessAsync().then(value => this.brightness.set(value));
    addBrightnessListener(event => this.brightness.set(event.brightness));

    if (Platform.OS === 'android') {
      getSystemBrightnessModeAsync().then(mode => this.systemMode.set(mode));
      isUsingSystemBrightnessAsync().then(value => this.isUsingSystem.set(toCapabilityStatus(value)));
    }
  }

  brightnessLabel(): string {
    const value = this.brightness();
    return value === null ? 'checking…' : `${Math.round(value * 100)}%`;
  }

  systemModeLabel(): string {
    return formatBrightnessMode(this.systemMode());
  }

  permissionLabel(): string {
    const status = this.permissionStatus();
    return status === null ? 'checking…' : status.status;
  }

  handleSetBrightness(value: number): void {
    setBrightnessAsync(value).then(() => getBrightnessAsync().then(result => this.brightness.set(result)));
  }

  handleSetSystemMode(mode: BrightnessMode): void {
    setSystemBrightnessModeAsync(mode).then(() =>
      getSystemBrightnessModeAsync().then(result => this.systemMode.set(result)),
    );
  }

  handleRestoreSystem(): void {
    restoreSystemBrightnessAsync().then(() =>
      isUsingSystemBrightnessAsync().then(value => this.isUsingSystem.set(toCapabilityStatus(value))),
    );
  }

  requestPermission(): void {
    void this.permissionsService.request();
  }

  statusBadgeClass(status: ICapabilityStatus): string {
    return `status-badge status-badge-${status}`;
  }

  statusLabel(status: ICapabilityStatus): string {
    return status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
  }
}
