import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Platform, SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
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
import { Scenario } from '../components/Scenario';
import { toCapabilityStatus } from '../components/capability-status';
import type { ICapabilityStatus } from '../components/capability-status';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { CapabilityRow } from './CapabilityRow';
import { ValueRow } from './ValueRow';

type IBrightnessStep = { label: string; value: number };

const PENDING_LABEL = 'checking…';
const PERCENT_SCALE = 100;
const ANDROID_OS = 'android';

const BRIGHTNESS_STEPS: readonly IBrightnessStep[] = [
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1 },
];

function brightnessModeLabel(mode: BrightnessMode): string {
  switch (mode) {
    case BrightnessMode.AUTOMATIC:
      return 'Automatic';
    case BrightnessMode.MANUAL:
      return 'Manual';
    default:
      return 'Unknown';
  }
}

@Component({
  selector: 'BrightnessScreen',
  standalone: true,
  imports: [ActionButton, CapabilityRow, Scenario, SYMBIOTE_ELEMENTS, ValueRow],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="brightness-scroll"
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
            <text class="hero-title">Brightness</text>
            <text class="hero-body">
              Read and change the screen brightness from the app, for example to
              make a QR code or a boarding pass easy to scan. Android can also
              change the system-wide value after the user grants the write
              settings permission.
            </text>
          </view>
        </view>

        <Scenario
          testID="brightness-scenario"
          title="Brighten the screen to show a QR code or a ticket"
          why="Scanners read a bright screen much better. Raise the brightness while the code is on screen and restore the user's level afterwards."
          [steps]="scenarioSteps"
          expect="The screen visibly brightens or dims, and the live card shows the new value. Restoring returns to the system setting."
        />

        <view testID="brightness-live-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Live brightness</text>
          </view>
          <ValueRow label="Screen brightness" [value]="brightnessLabel()" />
          <view class="button-row">
            @for (step of steps; track step.label) {
              <ActionButton
                [testID]="'brightness-set-' + step.label"
                [title]="step.label"
                [color]="lineColor"
                (press)="setBrightness(step.value)"
              />
            }
          </view>
        </view>

        @if (isAndroid) {
          <view testID="brightness-system-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title"
                >System brightness (Android only)</text
              >
            </view>
            <ValueRow label="Mode" [value]="systemModeLabel()" />
            <CapabilityRow
              testID="brightness-using-system"
              label="Using system value"
              [status]="systemUsageStatus()"
            />
            <view class="button-row">
              <ActionButton
                testID="brightness-mode-automatic"
                title="Automatic"
                [color]="lineColor"
                (press)="setSystemMode(modes.AUTOMATIC)"
              />
              <ActionButton
                testID="brightness-mode-manual"
                title="Manual"
                [color]="lineColor"
                (press)="setSystemMode(modes.MANUAL)"
              />
              <ActionButton
                testID="brightness-restore-system"
                title="Restore system"
                [color]="lineColor"
                (press)="restoreSystem()"
              />
            </view>
          </view>
        }

        <view testID="brightness-permission-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Permission</text>
          </view>
          <ValueRow
            label="SYSTEM_BRIGHTNESS status"
            [value]="permissionLabel()"
          />
          <ActionButton
            testID="brightness-request-permission"
            title="Request permission"
            [color]="lineColor"
            (press)="requestPermission()"
          />
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class BrightnessScreen {
  readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Brightness];
  readonly lineColor = LINE_COLOR.brightness;
  readonly badgeStyle = { backgroundColor: LINE_COLOR.brightness };
  readonly isAndroid = Platform.OS === ANDROID_OS;
  readonly steps = BRIGHTNESS_STEPS;
  readonly modes = BrightnessMode;
  readonly scenarioSteps = [
    'Note the current brightness in the live card',
    'Set a new value with the controls',
    'Restore the system value',
  ];

  private readonly permissions = inject(PermissionsService);
  private readonly permissionStatus = this.permissions.connect();

  private readonly brightness = signal<number | null>(null);
  private readonly systemMode = signal<BrightnessMode>(BrightnessMode.UNKNOWN);
  readonly systemUsageStatus = signal<ICapabilityStatus>('checking');

  readonly brightnessLabel = computed(() => {
    const value = this.brightness();
    return value === null
      ? PENDING_LABEL
      : `${Math.round(value * PERCENT_SCALE)}%`;
  });
  readonly systemModeLabel = computed(() =>
    brightnessModeLabel(this.systemMode()),
  );
  readonly permissionLabel = computed(() => {
    const status = this.permissionStatus();
    return status === null ? PENDING_LABEL : status.status;
  });

  constructor() {
    void getBrightnessAsync().then(value => this.brightness.set(value));
    const subscription = addBrightnessListener(event =>
      this.brightness.set(event.brightness),
    );
    inject(DestroyRef).onDestroy(() => subscription.remove());
    if (this.isAndroid) {
      void Promise.all([
        getSystemBrightnessModeAsync(),
        isUsingSystemBrightnessAsync(),
      ]).then(([mode, isUsingSystem]) => {
        this.systemMode.set(mode);
        this.systemUsageStatus.set(toCapabilityStatus(isUsingSystem));
      });
    }
  }

  setBrightness(value: number): void {
    void setBrightnessAsync(value).then(() =>
      getBrightnessAsync().then(current => this.brightness.set(current)),
    );
  }

  setSystemMode(mode: BrightnessMode): void {
    void setSystemBrightnessModeAsync(mode).then(() =>
      getSystemBrightnessModeAsync().then(current =>
        this.systemMode.set(current),
      ),
    );
  }

  restoreSystem(): void {
    void restoreSystemBrightnessAsync().then(() =>
      isUsingSystemBrightnessAsync().then(isUsingSystem =>
        this.systemUsageStatus.set(toCapabilityStatus(isUsingSystem)),
      ),
    );
  }

  requestPermission(): void {
    void this.permissions.request();
  }
}
