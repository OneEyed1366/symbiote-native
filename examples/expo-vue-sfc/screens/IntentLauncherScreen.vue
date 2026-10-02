<script setup lang="ts">
import { ref } from 'vue';
import {
  ActivityAction,
  ResultCode,
  getApplicationIconAsync,
  openApplication,
  startActivityAsync,
} from '@symbiote-native/intent-launcher';
import type { IIntentLauncherResult } from '@symbiote-native/intent-launcher';
import ActionButton from '../components/ActionButton.vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Explorer from '../components/Explorer.vue';
import Field from '../components/Field.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.IntentLauncher;
const color = lineColorOf(ROUTE);

const ACTIONS = [
  { label: 'SETTINGS', value: ActivityAction.SETTINGS },
  { label: 'WIFI_SETTINGS', value: ActivityAction.WIFI_SETTINGS },
  { label: 'BLUETOOTH_SETTINGS', value: ActivityAction.BLUETOOTH_SETTINGS },
  { label: 'LOCATION_SOURCE_SETTINGS', value: ActivityAction.LOCATION_SOURCE_SETTINGS },
  { label: 'APPLICATION_DETAILS_SETTINGS', value: ActivityAction.APPLICATION_DETAILS_SETTINGS },
  { label: 'BATTERY_SAVER_SETTINGS', value: ActivityAction.BATTERY_SAVER_SETTINGS },
  { label: 'DISPLAY_SETTINGS', value: ActivityAction.DISPLAY_SETTINGS },
  { label: 'SOUND_SETTINGS', value: ActivityAction.SOUND_SETTINGS },
  { label: 'NOTIFICATION_SETTINGS', value: ActivityAction.NOTIFICATION_SETTINGS },
  { label: 'DATE_SETTINGS', value: ActivityAction.DATE_SETTINGS },
] as const;

const RESULT_LABELS: Record<ResultCode, string> = {
  [ResultCode.Success]: 'Success (-1)',
  [ResultCode.Canceled]: 'Canceled (0)',
  [ResultCode.FirstUser]: 'FirstUser (1)',
};

const action = ref<string>(ActivityAction.SETTINGS);
const type = ref('');
const category = ref('');
const extra = ref('');
const data = ref('');
const flags = ref('');
const packageName = ref('');
const className = ref('');
const result = ref<IIntentLauncherResult | null>(null);
const status = ref('idle');

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

function requirePackageName(): string {
  if (packageName.value.trim() === '') {
    throw new Error('fill the packageName field first');
  }
  return packageName.value.trim();
}

function start(): void {
  status.value = 'launching…';
  Promise.resolve()
    .then(() =>
      startActivityAsync(action.value, {
        type: optional(type.value),
        category: optional(category.value),
        extra: parseExtra(extra.value),
        data: optional(data.value),
        flags: flags.value.trim() === '' ? undefined : Number(flags.value),
        packageName: optional(packageName.value),
        className: optional(className.value),
      }),
    )
    .then(outcome => {
      result.value = outcome;
      status.value = 'returned';
    })
    .catch((error: Error) => {
      status.value = `failed: ${error.message}`;
    });
}

const appCalls = [
  { label: 'openApplication', run: async () => openApplication(requirePackageName()) },
  { label: 'getApplicationIconAsync', run: () => getApplicationIconAsync(requirePackageName()) },
];
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="intent-launcher-scroll"
    title="Intent Launcher"
    body="Android only. Open system settings screens, start other apps and get a result back, using the full Android intent model: action, data, extras, flags and component."
  >
    <Scenario
      testID="intent-launcher-start-card"
      title="Send the user to the right system settings screen (Android)"
      why="When a feature needs Wi-Fi, location, notifications or battery settings, open exactly that screen instead of telling the user to dig through menus."
      :steps="[
        'Press Open settings (the SETTINGS action is preselected)',
        'Come back with the back button',
        'Pick another action in the explorer, such as WIFI_SETTINGS, and repeat',
      ]"
      expect="The system settings open. After returning, the status says returned and resultCode shows what the target reported. iOS has no such API."
    >
      <ActionButton
        testID="intent-launcher-start-button"
        title="Open settings"
        :onPress="start"
        :color="color"
      />
      <ResultRow testID="intent-launcher-status" label="Status" :value="status" />
      <template v-if="result">
        <ResultRow
          testID="intent-launcher-result-code"
          label="resultCode"
          :value="RESULT_LABELS[result.resultCode] ?? String(result.resultCode)"
        />
        <ResultRow testID="intent-launcher-result-data" label="data" :value="String(result.data)" />
        <ResultRow
          testID="intent-launcher-result-extra"
          label="extra"
          :value="JSON.stringify(result.extra)"
        />
      </template>
    </Scenario>
    <Explorer testID="intent-launcher-explorer" :color="color">
      <Card testID="intent-launcher-params-card" title="Intent parameters">
        <ChoiceRow
          testID="intent-launcher-action"
          label="ActivityAction presets"
          :options="ACTIONS"
          :value="action"
          :onChange="next => (action = next)"
          :color="color"
        />
        <Field
          testID="intent-launcher-action-input"
          label="activity action (any string)"
          :value="action"
          :onChange="next => (action = next)"
        />
        <Field
          testID="intent-launcher-type-input"
          label="type (MIME)"
          :value="type"
          :onChange="next => (type = next)"
        />
        <Field
          testID="intent-launcher-category-input"
          label="category"
          :value="category"
          :onChange="next => (category = next)"
        />
        <Field
          testID="intent-launcher-extra-input"
          label="extra (JSON object)"
          :value="extra"
          :onChange="next => (extra = next)"
          placeholder='{"android.provider.extra.APP_PACKAGE": "com.example"}'
        />
        <Field
          testID="intent-launcher-data-input"
          label="data (URI)"
          :value="data"
          :onChange="next => (data = next)"
          placeholder="package:com.example"
        />
        <Field
          testID="intent-launcher-flags-input"
          label="flags (number)"
          :value="flags"
          :onChange="next => (flags = next)"
        />
        <Field
          testID="intent-launcher-package-input"
          label="packageName"
          :value="packageName"
          :onChange="next => (packageName = next)"
        />
        <Field
          testID="intent-launcher-class-input"
          label="className"
          :value="className"
          :onChange="next => (className = next)"
        />
      </Card>
      <CallConsole
        prefix="intent-launcher-app"
        title="Applications"
        :color="color"
        :calls="appCalls"
      />
    </Explorer>
  </ScreenShell>
</template>
