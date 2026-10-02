<script lang="ts">
  import {
    ActivityAction,
    ResultCode,
    getApplicationIconAsync,
    openApplication,
    startActivityAsync,
  } from '@symbiote-native/intent-launcher';
  import type { IIntentLauncherResult } from '@symbiote-native/intent-launcher';
  import ActionButton from '../components/ActionButton.svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Explorer from '../components/Explorer.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const ROUTE = ROUTE_NAME.IntentLauncher;
  const color = lineColorOf(ROUTE);

  const ACTIONS = [
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
  ] as const;

  const RESULT_LABELS: Record<ResultCode, string> = {
    [ResultCode.Success]: 'Success (-1)',
    [ResultCode.Canceled]: 'Canceled (0)',
    [ResultCode.FirstUser]: 'FirstUser (1)',
  };

  let action = $state<string>(ActivityAction.SETTINGS);
  let type = $state('');
  let category = $state('');
  let extra = $state('');
  let data = $state('');
  let flags = $state('');
  let packageName = $state('');
  let className = $state('');
  let result = $state<IIntentLauncherResult | null>(null);
  let status = $state('idle');

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
    if (packageName.trim() === '') {
      throw new Error('fill the packageName field first');
    }
    return packageName.trim();
  }

  function start(): void {
    status = 'launching…';
    Promise.resolve()
      .then(() =>
        startActivityAsync(action, {
          type: optional(type),
          category: optional(category),
          extra: parseExtra(extra),
          data: optional(data),
          flags: flags.trim() === '' ? undefined : Number(flags),
          packageName: optional(packageName),
          className: optional(className),
        }),
      )
      .then(outcome => {
        result = outcome;
        status = 'returned';
      })
      .catch((error: Error) => {
        status = `failed: ${error.message}`;
      });
  }
</script>

<ScreenShell
  route={ROUTE}
  testID="intent-launcher-scroll"
  title="Intent Launcher"
  body="Android only. Open system settings screens, start other apps and get a result back, using the full Android intent model: action, data, extras, flags and component."
>
  <Scenario
    testID="intent-launcher-start-card"
    title="Send the user to the right system settings screen (Android)"
    why="When a feature needs Wi-Fi, location, notifications or battery settings, open exactly that screen instead of telling the user to dig through menus."
    steps={[
      'Press Open settings (the SETTINGS action is preselected)',
      'Come back with the back button',
      'Pick another action in the explorer, such as WIFI_SETTINGS, and repeat',
    ]}
    expect="The system settings open. After returning, the status says returned and resultCode shows what the target reported. iOS has no such API."
  >
    <ActionButton
      testID="intent-launcher-start-button"
      title="Open settings"
      onPress={start}
      {color}
    />
    <ResultRow testID="intent-launcher-status" label="Status" value={status} />
    {#if result}
      <ResultRow
        testID="intent-launcher-result-code"
        label="resultCode"
        value={RESULT_LABELS[result.resultCode] ?? String(result.resultCode)}
      />
      <ResultRow
        testID="intent-launcher-result-data"
        label="data"
        value={String(result.data)}
      />
      <ResultRow
        testID="intent-launcher-result-extra"
        label="extra"
        value={JSON.stringify(result.extra)}
      />
    {/if}
  </Scenario>
  <Explorer testID="intent-launcher-explorer" {color}>
    <Card testID="intent-launcher-params-card" title="Intent parameters">
      <ChoiceRow
        testID="intent-launcher-action"
        label="ActivityAction presets"
        options={ACTIONS}
        value={action}
        onChange={next => {
          action = next;
        }}
        {color}
      />
      <Field
        testID="intent-launcher-action-input"
        label="activity action (any string)"
        value={action}
        onChange={next => {
          action = next;
        }}
      />
      <Field
        testID="intent-launcher-type-input"
        label="type (MIME)"
        value={type}
        onChange={next => {
          type = next;
        }}
      />
      <Field
        testID="intent-launcher-category-input"
        label="category"
        value={category}
        onChange={next => {
          category = next;
        }}
      />
      <Field
        testID="intent-launcher-extra-input"
        label="extra (JSON object)"
        value={extra}
        onChange={next => {
          extra = next;
        }}
        placeholder={'{"android.provider.extra.APP_PACKAGE": "com.example"}'}
      />
      <Field
        testID="intent-launcher-data-input"
        label="data (URI)"
        value={data}
        onChange={next => {
          data = next;
        }}
        placeholder="package:com.example"
      />
      <Field
        testID="intent-launcher-flags-input"
        label="flags (number)"
        value={flags}
        onChange={next => {
          flags = next;
        }}
      />
      <Field
        testID="intent-launcher-package-input"
        label="packageName"
        value={packageName}
        onChange={next => {
          packageName = next;
        }}
      />
      <Field
        testID="intent-launcher-class-input"
        label="className"
        value={className}
        onChange={next => {
          className = next;
        }}
      />
    </Card>
    <CallConsole
      prefix="intent-launcher-app"
      title="Applications"
      {color}
      calls={[
        {
          label: 'openApplication',
          run: async () => openApplication(requirePackageName()),
        },
        {
          label: 'getApplicationIconAsync',
          run: () => getApplicationIconAsync(requirePackageName()),
        },
      ]}
    />
  </Explorer>
</ScreenShell>
