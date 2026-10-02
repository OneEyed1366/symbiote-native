import { Component, DestroyRef, inject, signal } from '@angular/core';
import {
  addScreenshotListener,
  allowScreenCaptureAsync,
  disableAppSwitcherProtectionAsync,
  enableAppSwitcherProtectionAsync,
  isAvailableAsync,
  preventScreenCaptureAsync,
} from '@symbiote-native/screen-capture/angular';
import type { EventSubscription } from '@symbiote-native/screen-capture/angular';
import { ActionButton } from '../components/ActionButton';
import { Explorer } from '../components/Explorer';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { ScreenCapturePermissionsCard } from './ScreenCapturePermissionsCard';
import { ScreenCapturePreventHolder } from './ScreenCapturePreventHolder';

@Component({
  selector: 'ScreenCaptureScreen',
  standalone: true,
  imports: [
    ActionButton,
    Explorer,
    Field,
    ResultRow,
    Scenario,
    ScreenCapturePermissionsCard,
    ScreenCapturePreventHolder,
    ScreenShell,
    ToggleRow,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="screen-capture-scroll"
      title="Screen Capture"
      body="Protect private screens: block screenshots and screen recording, blur the app-switcher preview and find out when a screenshot is taken."
    >
      <Scenario
        testID="screen-capture-prevent-card"
        title="Hide sensitive content from screenshots and recordings"
        why="Banking details, one-time codes and private documents should not end up in the camera roll or in a screen recording."
        [steps]="preventSteps"
        expect="The capture is black while protection is on and normal again after it is released. Protection stays until every key is released."
      >
        <ResultRow
          testID="screen-capture-available"
          label="isAvailableAsync"
          [value]="isAvailable()"
        />
        <Field
          testID="screen-capture-hook-key-input"
          label="hook key"
          [(value)]="hookKey"
        />
        <ToggleRow
          testID="screen-capture-hook-switch"
          label="usePreventScreenCapture(key)"
          [(value)]="isHookOn"
          [color]="color"
        />
        @if (isHookOn()) {
          <ScreenCapturePreventHolder [keyName]="hookKey()" />
        }
        <Field
          testID="screen-capture-key-input"
          label="imperative key (calls are counted per key)"
          [(value)]="imperativeKey"
        />
        <ActionButton
          testID="screen-capture-prevent-button"
          title="preventScreenCaptureAsync"
          [color]="color"
          (press)="runPrevent('prevent', () => preventCapture(imperativeKey()))"
        />
        <ActionButton
          testID="screen-capture-allow-button"
          title="allowScreenCaptureAsync"
          [color]="color"
          (press)="runPrevent('allow', () => allowCapture(imperativeKey()))"
        />
        <ResultRow
          testID="screen-capture-status"
          label="Last call"
          [value]="preventStatus()"
        />
      </Scenario>

      <Scenario
        testID="screen-capture-switcher-card"
        title="Blur the app in the task switcher (iOS)"
        why="The app-switcher preview is a screenshot too. Blur it so a glance over a shoulder does not reveal the screen."
        [steps]="switcherSteps"
        expect="The preview of this app is blurred while protection is on and sharp again after you turn it off."
      >
        <Field
          testID="screen-capture-blur-input"
          label="blurIntensity (0 - 1)"
          [(value)]="blurIntensity"
        />
        <ActionButton
          testID="screen-capture-switcher-enable-button"
          title="enableAppSwitcherProtectionAsync"
          [color]="color"
          (press)="runSwitcher('enable', () => enableSwitcher(intensity()))"
        />
        <ActionButton
          testID="screen-capture-switcher-disable-button"
          title="disableAppSwitcherProtectionAsync"
          [color]="color"
          (press)="runSwitcher('disable', () => disableSwitcher())"
        />
        <ResultRow
          testID="screen-capture-switcher-status"
          label="Last call"
          [value]="switcherStatus()"
        />
      </Scenario>

      <Scenario
        testID="screen-capture-screenshot-card"
        title="Notice when the user takes a screenshot"
        why="Warn the user, log the event or hide content when someone screenshots a private screen. Android 13 and later need the storage permission from the explorer for detection."
        [steps]="screenshotSteps"
        expect="The screenshot counter goes up by one for each screenshot."
      >
        <ResultRow
          testID="screen-capture-hook-count"
          label="useScreenshotListener count"
          [value]="'' + hookCount()"
        />
        <ToggleRow
          testID="screen-capture-manual-switch"
          label="addScreenshotListener / removeScreenshotListener"
          [value]="isManualOn()"
          (valueChange)="toggleManual($event)"
          [color]="color"
        />
        <ResultRow
          testID="screen-capture-manual-count"
          label="manual listener count"
          [value]="'' + manualCount()"
        />
      </Scenario>

      <Explorer testID="screen-capture-explorer" [color]="color">
        <ng-template><ScreenCapturePermissionsCard /></ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class ScreenCaptureScreen {
  readonly route = ROUTE_NAME.ScreenCapture;
  readonly color = lineColorOf(ROUTE_NAME.ScreenCapture);
  readonly preventCapture = preventScreenCaptureAsync;
  readonly allowCapture = allowScreenCaptureAsync;
  readonly enableSwitcher = enableAppSwitcherProtectionAsync;
  readonly disableSwitcher = disableAppSwitcherProtectionAsync;
  readonly preventSteps = [
    'Turn protection on',
    'Take a screenshot or start a screen recording',
    'Open the capture',
  ];
  readonly switcherSteps = [
    'Turn the blur on',
    'Go to the home screen and open the app switcher',
  ];
  readonly screenshotSteps = [
    'Start listening',
    'Take a screenshot while this screen is open',
  ];

  readonly isAvailable = signal('checking…');
  readonly hookKey = signal('hook-demo');
  readonly isHookOn = signal(false);
  readonly imperativeKey = signal('manual-demo');
  readonly preventStatus = signal('idle');
  readonly blurIntensity = signal('0.5');
  readonly switcherStatus = signal('idle');
  readonly hookCount = signal(0);
  readonly manualCount = signal(0);
  readonly isManualOn = signal(false);
  private subscription: EventSubscription | null = null;

  constructor() {
    void isAvailableAsync().then(available => {
      this.isAvailable.set(available ? 'YES' : 'NO');
    });
    const hookSubscription = addScreenshotListener(() =>
      this.hookCount.update(count => count + 1),
    );
    inject(DestroyRef).onDestroy(() => {
      hookSubscription.remove();
      this.subscription?.remove();
      this.subscription = null;
    });
  }

  runPrevent(label: string, call: () => Promise<void>): void {
    call()
      .then(() => this.preventStatus.set(`${label} ok`))
      .catch((error: Error) =>
        this.preventStatus.set(`${label} failed: ${error.message}`),
      );
  }

  runSwitcher(label: string, call: () => Promise<void>): void {
    call()
      .then(() => this.switcherStatus.set(`${label} ok`))
      .catch((error: Error) =>
        this.switcherStatus.set(`${label} failed: ${error.message}`),
      );
  }

  toggleManual(next: boolean): void {
    this.isManualOn.set(next);
    if (next) {
      this.subscription = addScreenshotListener(() =>
        this.manualCount.update(count => count + 1),
      );
    } else {
      this.subscription?.remove();
      this.subscription = null;
    }
  }

  intensity(): number | undefined {
    const value = Number(this.blurIntensity());
    return Number.isNaN(value) ? undefined : value;
  }
}
