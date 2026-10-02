import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  ActivityAction,
  ResultCode,
  getApplicationIconAsync,
  openApplication,
  startActivityAsync,
} from '@symbiote-native/intent-launcher';
import type { IIntentLauncherResult } from '@symbiote-native/intent-launcher';
import { ActionButton } from '../components/ActionButton';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Explorer } from '../components/Explorer';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const ACTIONS: readonly { label: string; value: string }[] = [
  { label: 'SETTINGS', value: ActivityAction.SETTINGS },
  { label: 'WIFI_SETTINGS', value: ActivityAction.WIFI_SETTINGS },
  { label: 'BLUETOOTH_SETTINGS', value: ActivityAction.BLUETOOTH_SETTINGS },
  {
    label: 'LOCATION_SOURCE_SETTINGS',
    value: ActivityAction.LOCATION_SOURCE_SETTINGS,
  },
  {
    label: 'APPLICATION_DETAILS_SETTINGS',
    value: ActivityAction.APPLICATION_DETAILS_SETTINGS,
  },
  {
    label: 'BATTERY_SAVER_SETTINGS',
    value: ActivityAction.BATTERY_SAVER_SETTINGS,
  },
  { label: 'DISPLAY_SETTINGS', value: ActivityAction.DISPLAY_SETTINGS },
  { label: 'SOUND_SETTINGS', value: ActivityAction.SOUND_SETTINGS },
  {
    label: 'NOTIFICATION_SETTINGS',
    value: ActivityAction.NOTIFICATION_SETTINGS,
  },
  { label: 'DATE_SETTINGS', value: ActivityAction.DATE_SETTINGS },
];

const RESULT_LABELS: Record<ResultCode, string> = {
  [ResultCode.Success]: 'Success (-1)',
  [ResultCode.Canceled]: 'Canceled (0)',
  [ResultCode.FirstUser]: 'FirstUser (1)',
};

function optional(text: string): string | undefined {
  return text.trim() === '' ? undefined : text.trim();
}

function parseExtra(text: string): Record<string, unknown> | undefined {
  if (text.trim() === '') {
    return undefined;
  }
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('extra must be a JSON object');
  }
  return Object.fromEntries(Object.entries(parsed));
}

@Component({
  selector: 'IntentLauncherScreen',
  standalone: true,
  imports: [
    ActionButton,
    CallConsole,
    Card,
    ChoiceRow,
    Explorer,
    Field,
    ResultRow,
    Scenario,
    ScreenShell,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="intent-launcher-scroll"
      title="Intent Launcher"
      body="Android only. Open system settings screens, start other apps and get a result back, using the full Android intent model: action, data, extras, flags and component."
    >
      <Scenario
        testID="intent-launcher-start-card"
        title="Send the user to the right system settings screen (Android)"
        why="When a feature needs Wi-Fi, location, notifications or battery settings, open exactly that screen instead of telling the user to dig through menus."
        [steps]="startSteps"
        expect="The system settings open. After returning, the status says returned and resultCode shows what the target reported. iOS has no such API."
      >
        <ActionButton
          testID="intent-launcher-start-button"
          title="Open settings"
          [color]="color"
          (press)="start()"
        />
        <ResultRow
          testID="intent-launcher-status"
          label="Status"
          [value]="status()"
        />
        @if (result(); as outcome) {
          <ResultRow
            testID="intent-launcher-result-code"
            label="resultCode"
            [value]="
              resultLabels[outcome.resultCode] ?? '' + outcome.resultCode
            "
          />
          <ResultRow
            testID="intent-launcher-result-data"
            label="data"
            [value]="'' + outcome.data"
          />
          <ResultRow
            testID="intent-launcher-result-extra"
            label="extra"
            [value]="stringify(outcome.extra)"
          />
        }
      </Scenario>
      <Explorer testID="intent-launcher-explorer" [color]="color">
        <ng-template>
          <Card testID="intent-launcher-params-card" title="Intent parameters">
            <ChoiceRow
              testID="intent-launcher-action"
              label="ActivityAction presets"
              [options]="actions"
              [(value)]="action"
              [color]="color"
            />
            <Field
              testID="intent-launcher-action-input"
              label="activity action (any string)"
              [(value)]="action"
            />
            <Field
              testID="intent-launcher-type-input"
              label="type (MIME)"
              [(value)]="type"
            />
            <Field
              testID="intent-launcher-category-input"
              label="category"
              [(value)]="category"
            />
            <Field
              testID="intent-launcher-extra-input"
              label="extra (JSON object)"
              [(value)]="extra"
              placeholder='{"android.provider.extra.APP_PACKAGE": "com.example"}'
            />
            <Field
              testID="intent-launcher-data-input"
              label="data (URI)"
              [(value)]="data"
              placeholder="package:com.example"
            />
            <Field
              testID="intent-launcher-flags-input"
              label="flags (number)"
              [(value)]="flags"
            />
            <Field
              testID="intent-launcher-package-input"
              label="packageName"
              [(value)]="packageName"
            />
            <Field
              testID="intent-launcher-class-input"
              label="className"
              [(value)]="className"
            />
          </Card>
          <CallConsole
            prefix="intent-launcher-app"
            title="Applications"
            [color]="color"
            [calls]="appCalls"
          />
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class IntentLauncherScreen {
  readonly route = ROUTE_NAME.IntentLauncher;
  readonly color = lineColorOf(ROUTE_NAME.IntentLauncher);
  readonly actions = ACTIONS;
  readonly resultLabels: Record<number, string | undefined> = RESULT_LABELS;
  readonly stringify = JSON.stringify;
  readonly startSteps = [
    'Press Open settings (the SETTINGS action is preselected)',
    'Come back with the back button',
    'Pick another action in the explorer, such as WIFI_SETTINGS, and repeat',
  ];

  readonly action = signal<string>(ActivityAction.SETTINGS);
  readonly type = signal('');
  readonly category = signal('');
  readonly extra = signal('');
  readonly data = signal('');
  readonly flags = signal('');
  readonly packageName = signal('');
  readonly className = signal('');
  readonly result = signal<IIntentLauncherResult | null>(null);
  readonly status = signal('idle');

  readonly appCalls = [
    {
      label: 'openApplication',
      run: async () => openApplication(this.requirePackageName()),
    },
    {
      label: 'getApplicationIconAsync',
      run: () => getApplicationIconAsync(this.requirePackageName()),
    },
  ];

  private requirePackageName(): string {
    const name = this.packageName().trim();
    if (name === '') {
      throw new Error('fill the packageName field first');
    }
    return name;
  }

  start(): void {
    this.status.set('launching…');
    Promise.resolve()
      .then(() =>
        startActivityAsync(this.action(), {
          type: optional(this.type()),
          category: optional(this.category()),
          extra: parseExtra(this.extra()),
          data: optional(this.data()),
          flags: this.flags().trim() === '' ? undefined : Number(this.flags()),
          packageName: optional(this.packageName()),
          className: optional(this.className()),
        }),
      )
      .then(outcome => {
        this.result.set(outcome);
        this.status.set('returned');
      })
      .catch((error: Error) => this.status.set(`failed: ${error.message}`));
  }
}
