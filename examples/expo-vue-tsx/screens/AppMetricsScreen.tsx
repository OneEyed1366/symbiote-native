import { defineComponent, ref } from 'vue';
import {
  AppMetricsErrorBoundary,
  AppMetricsRoot,
  clearStoredEntries,
  logEvent,
  markFirstRender,
  markInteractive,
  reportError,
  setGlobalAttributes,
} from '@symbiote-native/app-metrics/vue';
import type {
  IAppMetricsErrorBoundaryFallbackProps,
  ILogAttributeValue,
  ILogSeverity,
  IReportErrorInput,
} from '@symbiote-native/app-metrics/vue';
import { ActionButton } from '../components/ActionButton';
import { CallConsole } from '../components/CallConsole';
import { Explorer, Scenario } from '../components/Scenario';
import {
  Card,
  ChoiceRow,
  Field,
  ScreenShell,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { NetworkObserverCard, SessionCalls } from './app-metrics-sessions';

const ROUTE = ROUTE_NAME.AppMetrics;
const color = lineColorOf(ROUTE);

const SEVERITIES: readonly ILogSeverity[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
const SOURCES: readonly IReportErrorInput['source'][] = ['global', 'errorBoundary', 'reportedByUser'];

function choices<T extends string>(values: readonly T[]) {
  return values.map(value => ({ label: value, value }));
}

function parseAttributes(text: string): Record<string, ILogAttributeValue> | null {
  if (text.trim() === '') {
    return null;
  }
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('attributes must be a JSON object');
  }
  return Object.fromEntries(Object.entries(parsed));
}

const MarkCard = defineComponent(
  () => {
    const routeName = ref('AppMetrics');
    const params = ref('{"demo": true}');
    return () => (
      <>
        <Card testID="app-metrics-mark-card" title="Startup marks">
          <Field testID="app-metrics-route-input" label="routeName" value={routeName.value} onChange={next => { routeName.value = next; }} />
          <Field testID="app-metrics-params-input" label="params (JSON object)" value={params.value} onChange={next => { params.value = next; }} />
        </Card>
        <CallConsole
          prefix="app-metrics-mark"
          title="Marks and storage"
          color={color}
          calls={[
            { label: 'markFirstRender', run: async () => markFirstRender() },
            {
              label: 'markInteractive',
              run: async () => markInteractive({ routeName: routeName.value, params: parseAttributes(params.value) ?? undefined }),
            },
            { label: 'clearStoredEntries', run: () => clearStoredEntries() },
          ]}
        />
      </>
    );
  },
  { name: 'MarkCard' },
);

const LogCard = defineComponent(
  () => {
    const name = ref('canary_event');
    const displayName = ref('Canary event');
    const body = ref('Logged from the canary');
    const attributes = ref('{"screen": "AppMetrics"}');
    const globalAttributes = ref('{"build": "canary"}');
    const severity = ref<ILogSeverity>('info');
    return () => (
      <>
        <Card testID="app-metrics-log-card" title="Log events">
          <Field testID="app-metrics-log-name-input" label="event name" value={name.value} onChange={next => { name.value = next; }} />
          <Field testID="app-metrics-log-display-input" label="displayName" value={displayName.value} onChange={next => { displayName.value = next; }} />
          <Field testID="app-metrics-log-body-input" label="body" value={body.value} onChange={next => { body.value = next; }} />
          <Field testID="app-metrics-log-attributes-input" label="attributes (JSON object)" value={attributes.value} onChange={next => { attributes.value = next; }} />
          <ChoiceRow testID="app-metrics-severity" label="severity" options={choices(SEVERITIES)} value={severity.value} onChange={next => { severity.value = next; }} color={color} />
          <Field testID="app-metrics-global-input" label="global attributes (JSON object, empty clears)" value={globalAttributes.value} onChange={next => { globalAttributes.value = next; }} />
        </Card>
        <CallConsole
          prefix="app-metrics-log"
          title="Logging calls"
          color={color}
          calls={[
            {
              label: 'logEvent',
              run: async () =>
                logEvent(name.value, { displayName: displayName.value, body: body.value, attributes: parseAttributes(attributes.value), severity: severity.value }),
            },
            {
              label: 'setGlobalAttributes',
              run: async () => setGlobalAttributes(parseAttributes(globalAttributes.value)),
            },
            { label: 'setGlobalAttributes(null)', run: async () => setGlobalAttributes(null) },
          ]}
        />
      </>
    );
  },
  { name: 'LogCard' },
);

const ReportCard = defineComponent(
  () => {
    const source = ref<IReportErrorInput['source']>('reportedByUser');
    const type = ref('CanaryError');
    const message = ref('Reported from the canary');
    const stacktrace = ref('at ReportCard (AppMetricsScreen.tsx)');
    const componentStack = ref('');
    const isFatal = ref(false);
    return () => (
      <>
        <Card testID="app-metrics-report-card" title="reportError input">
          <ChoiceRow testID="app-metrics-source" label="source" options={choices(SOURCES)} value={source.value} onChange={next => { source.value = next; }} color={color} />
          <Field testID="app-metrics-type-input" label="type" value={type.value} onChange={next => { type.value = next; }} />
          <Field testID="app-metrics-message-input" label="message" value={message.value} onChange={next => { message.value = next; }} />
          <Field testID="app-metrics-stack-input" label="stacktrace" value={stacktrace.value} onChange={next => { stacktrace.value = next; }} />
          <Field testID="app-metrics-component-stack-input" label="componentStack" value={componentStack.value} onChange={next => { componentStack.value = next; }} />
          <ToggleRow testID="app-metrics-fatal-switch" label="isFatal" value={isFatal.value} onChange={next => { isFatal.value = next; }} color={color} />
        </Card>
        <CallConsole
          prefix="app-metrics-report"
          title="Error reporting"
          color={color}
          calls={[
            {
              label: 'reportError',
              run: async () =>
                reportError({
                  source: source.value,
                  type: type.value,
                  message: message.value,
                  stacktrace: stacktrace.value,
                  componentStack: componentStack.value === '' ? undefined : componentStack.value,
                  isFatal: isFatal.value,
                }),
            },
          ]}
        />
      </>
    );
  },
  { name: 'ReportCard' },
);

const Thrower = defineComponent(
  () => () => {
    throw new Error('Thrown on purpose by the canary');
  },
  { name: 'Thrower' },
);

const BoundaryCard = defineComponent(
  () => {
    const isThrowing = ref(false);
    const renderFallback = ({ error, resetError }: IAppMetricsErrorBoundaryFallbackProps) => (
      <view>
        <text testID="app-metrics-boundary-message" class="info-text">
          {`caught: ${error instanceof Error ? error.message : String(error)}`}
        </text>
        <ActionButton
          testID="app-metrics-reset-button"
          title="resetError"
          onPress={() => {
            isThrowing.value = false;
            resetError();
          }}
          color={color}
        />
      </view>
    );
    return () => (
      <Scenario
        testID="app-metrics-boundary-card"
        title="Catch a crash, report it and show a fallback instead of a white screen"
        why="A render error in one component should not kill the app. The boundary reports it to your metrics pipeline with the component stack and lets the user recover."
        steps={['Turn on the throwing component', 'Read the caught message', 'Press resetError']}
        expect="The error is caught, its message is shown and reported. Pressing resetError renders the tree normally again."
      >
        <ToggleRow
          testID="app-metrics-throw-switch"
          label="render a component that throws"
          value={isThrowing.value}
          onChange={next => { isThrowing.value = next; }}
          color={color}
        />
        <AppMetricsRoot errorBoundaryFallback={null}>
          <text class="info-text">Inside AppMetricsRoot, markFirstRender ran on mount.</text>
        </AppMetricsRoot>
        <AppMetricsErrorBoundary fallback={renderFallback}>
          {isThrowing.value && <Thrower />}
        </AppMetricsErrorBoundary>
      </Scenario>
    );
  },
  { name: 'BoundaryCard' },
);

export const AppMetricsScreen = defineComponent(
  () => () => (
    <ScreenShell
      route={ROUTE}
      testID="app-metrics-scroll"
      title="App Metrics"
      body="Know how your app behaves in the field: startup timing, sessions, custom log events, handled and unhandled errors and network requests, sent to your metrics backend."
    >
      <BoundaryCard />
      <Explorer testID="app-metrics-explorer" color={color}>
        <MarkCard />
        <LogCard />
        <ReportCard />
        <SessionCalls />
        <NetworkObserverCard />
      </Explorer>
    </ScreenShell>
  ),
  { name: 'AppMetricsScreen' },
);
