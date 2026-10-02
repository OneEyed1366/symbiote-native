import { Show, createSignal } from 'solid-js';
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
import { Explorer, Scenario } from '../components/Scenario';
import {
  Card,
  ChoiceRow,
  Field,
  ResultRow,
  ScreenShell,
  lineColorOf,
} from '../components/ScreenShell';
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

type IParams = {
  action: string;
  type: string;
  category: string;
  extra: string;
  data: string;
  flags: string;
  packageName: string;
  className: string;
};
type ISetParams = (patch: Partial<IParams>) => void;

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

function ParamsCard(props: { params: IParams; setParams: ISetParams }) {
  return (
    <Card testID="intent-launcher-params-card" title="Intent parameters">
      <ChoiceRow
        testID="intent-launcher-action"
        label="ActivityAction presets"
        options={ACTIONS}
        value={props.params.action}
        onChange={action => props.setParams({ action })}
        color={color}
      />
      <Field
        testID="intent-launcher-action-input"
        label="activity action (any string)"
        value={props.params.action}
        onChange={action => props.setParams({ action })}
      />
      <Field testID="intent-launcher-type-input" label="type (MIME)" value={props.params.type} onChange={type => props.setParams({ type })} />
      <Field testID="intent-launcher-category-input" label="category" value={props.params.category} onChange={category => props.setParams({ category })} />
      <Field
        testID="intent-launcher-extra-input"
        label="extra (JSON object)"
        value={props.params.extra}
        onChange={extra => props.setParams({ extra })}
        placeholder='{"android.provider.extra.APP_PACKAGE": "com.example"}'
      />
      <Field testID="intent-launcher-data-input" label="data (URI)" value={props.params.data} onChange={data => props.setParams({ data })} placeholder="package:com.example" />
      <Field testID="intent-launcher-flags-input" label="flags (number)" value={props.params.flags} onChange={flags => props.setParams({ flags })} />
      <Field testID="intent-launcher-package-input" label="packageName" value={props.params.packageName} onChange={packageName => props.setParams({ packageName })} />
      <Field testID="intent-launcher-class-input" label="className" value={props.params.className} onChange={className => props.setParams({ className })} />
    </Card>
  );
}

function StartCard(props: { params: IParams }) {
  const [result, setResult] = createSignal<IIntentLauncherResult | null>(null);
  const [status, setStatus] = createSignal('idle');

  const start = () => {
    setStatus('launching…');
    Promise.resolve()
      .then(() =>
        startActivityAsync(props.params.action, {
          type: optional(props.params.type),
          category: optional(props.params.category),
          extra: parseExtra(props.params.extra),
          data: optional(props.params.data),
          flags: props.params.flags.trim() === '' ? undefined : Number(props.params.flags),
          packageName: optional(props.params.packageName),
          className: optional(props.params.className),
        }),
      )
      .then(outcome => {
        setResult(outcome);
        setStatus('returned');
      })
      .catch((error: Error) => setStatus(`failed: ${error.message}`));
  };

  return (
    <Scenario
      testID="intent-launcher-start-card"
      title="Send the user to the right system settings screen (Android)"
      why="When a feature needs Wi-Fi, location, notifications or battery settings, open exactly that screen instead of telling the user to dig through menus."
      steps={['Press Open settings (the SETTINGS action is preselected)', 'Come back with the back button', 'Pick another action in the explorer, such as WIFI_SETTINGS, and repeat']}
      expect="The system settings open. After returning, the status says returned and resultCode shows what the target reported. iOS has no such API."
    >
      <ActionButton
        testID="intent-launcher-start-button"
        title="Open settings"
        onPress={start}
        color={color}
      />
      <ResultRow testID="intent-launcher-status" label="Status" value={status()} />
      <Show when={result()}>
        {(outcome: () => IIntentLauncherResult) => (
          <>
            <ResultRow
              testID="intent-launcher-result-code"
              label="resultCode"
              value={RESULT_LABELS[outcome().resultCode] ?? String(outcome().resultCode)}
            />
            <ResultRow testID="intent-launcher-result-data" label="data" value={String(outcome().data)} />
            <ResultRow testID="intent-launcher-result-extra" label="extra" value={JSON.stringify(outcome().extra)} />
          </>
        )}
      </Show>
    </Scenario>
  );
}

function ApplicationCalls(props: { params: IParams }) {
  const name = () => {
    if (props.params.packageName.trim() === '') {
      throw new Error('fill the packageName field first');
    }
    return props.params.packageName.trim();
  };
  return (
    <CallConsole
      prefix="intent-launcher-app"
      title="Applications"
      color={color}
      calls={[
        { label: 'openApplication', run: async () => openApplication(name()) },
        { label: 'getApplicationIconAsync', run: () => getApplicationIconAsync(name()) },
      ]}
    />
  );
}

export function IntentLauncherScreen() {
  const [params, setParamsState] = createSignal<IParams>({
    action: ActivityAction.SETTINGS,
    type: '',
    category: '',
    extra: '',
    data: '',
    flags: '',
    packageName: '',
    className: '',
  });
  const setParams: ISetParams = patch =>
    setParamsState(previous => ({ ...previous, ...patch }));

  return (
    <ScreenShell
      route={ROUTE}
      testID="intent-launcher-scroll"
      title="Intent Launcher"
      body="Android only. Open system settings screens, start other apps and get a result back, using the full Android intent model: action, data, extras, flags and component."
    >
      <StartCard params={params()} />
      <Explorer testID="intent-launcher-explorer" color={color}>
        <ParamsCard params={params()} setParams={setParams} />
        <ApplicationCalls params={params()} />
      </Explorer>
    </ScreenShell>
  );
}
