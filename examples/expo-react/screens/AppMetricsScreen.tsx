import { useState } from 'react';
import {
  clearStoredEntries,
  logEvent,
  markFirstRender,
  markInteractive,
  reportError,
  setGlobalAttributes,
} from '@symbiote-native/app-metrics';
import type {
  ILogAttributeValue,
  ILogSeverity,
  IReportErrorInput,
} from '@symbiote-native/app-metrics';
import {
  AppMetricsErrorBoundary,
  AppMetricsRoot,
} from '@symbiote-native/app-metrics/react';
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

function MarkCard() {
  const [routeName, setRouteName] = useState('AppMetrics');
  const [params, setParams] = useState('{"demo": true}');
  return (
    <>
      <Card testID="app-metrics-mark-card" title="Startup marks">
        <Field testID="app-metrics-route-input" label="routeName" value={routeName} onChange={setRouteName} />
        <Field testID="app-metrics-params-input" label="params (JSON object)" value={params} onChange={setParams} />
      </Card>
      <CallConsole
        prefix="app-metrics-mark"
        title="Marks and storage"
        color={color}
        calls={[
          { label: 'markFirstRender', run: async () => markFirstRender() },
          {
            label: 'markInteractive',
            run: async () => markInteractive({ routeName, params: parseAttributes(params) ?? undefined }),
          },
          { label: 'clearStoredEntries', run: () => clearStoredEntries() },
        ]}
      />
    </>
  );
}

function LogCard() {
  const [name, setName] = useState('canary_event');
  const [displayName, setDisplayName] = useState('Canary event');
  const [body, setBody] = useState('Logged from the canary');
  const [attributes, setAttributesText] = useState('{"screen": "AppMetrics"}');
  const [globalAttributes, setGlobalText] = useState('{"build": "canary"}');
  const [severity, setSeverity] = useState<ILogSeverity>('info');
  return (
    <>
      <Card testID="app-metrics-log-card" title="Log events">
        <Field testID="app-metrics-log-name-input" label="event name" value={name} onChange={setName} />
        <Field testID="app-metrics-log-display-input" label="displayName" value={displayName} onChange={setDisplayName} />
        <Field testID="app-metrics-log-body-input" label="body" value={body} onChange={setBody} />
        <Field testID="app-metrics-log-attributes-input" label="attributes (JSON object)" value={attributes} onChange={setAttributesText} />
        <ChoiceRow testID="app-metrics-severity" label="severity" options={choices(SEVERITIES)} value={severity} onChange={setSeverity} color={color} />
        <Field testID="app-metrics-global-input" label="global attributes (JSON object, empty clears)" value={globalAttributes} onChange={setGlobalText} />
      </Card>
      <CallConsole
        prefix="app-metrics-log"
        title="Logging calls"
        color={color}
        calls={[
          {
            label: 'logEvent',
            run: async () =>
              logEvent(name, { displayName, body, attributes: parseAttributes(attributes), severity }),
          },
          {
            label: 'setGlobalAttributes',
            run: async () => setGlobalAttributes(parseAttributes(globalAttributes)),
          },
          { label: 'setGlobalAttributes(null)', run: async () => setGlobalAttributes(null) },
        ]}
      />
    </>
  );
}

function ReportCard() {
  const [source, setSource] = useState<IReportErrorInput['source']>('reportedByUser');
  const [type, setType] = useState('CanaryError');
  const [message, setMessage] = useState('Reported from the canary');
  const [stacktrace, setStacktrace] = useState('at ReportCard (AppMetricsScreen.tsx)');
  const [componentStack, setComponentStack] = useState('');
  const [isFatal, setIsFatal] = useState(false);
  return (
    <>
      <Card testID="app-metrics-report-card" title="reportError input">
        <ChoiceRow testID="app-metrics-source" label="source" options={choices(SOURCES)} value={source} onChange={setSource} color={color} />
        <Field testID="app-metrics-type-input" label="type" value={type} onChange={setType} />
        <Field testID="app-metrics-message-input" label="message" value={message} onChange={setMessage} />
        <Field testID="app-metrics-stack-input" label="stacktrace" value={stacktrace} onChange={setStacktrace} />
        <Field testID="app-metrics-component-stack-input" label="componentStack" value={componentStack} onChange={setComponentStack} />
        <ToggleRow testID="app-metrics-fatal-switch" label="isFatal" value={isFatal} onChange={setIsFatal} color={color} />
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
                source,
                type,
                message,
                stacktrace,
                componentStack: componentStack === '' ? undefined : componentStack,
                isFatal,
              }),
          },
        ]}
      />
    </>
  );
}

function Thrower(): never {
  throw new Error('Thrown on purpose by the canary');
}

function BoundaryCard() {
  const [isThrowing, setIsThrowing] = useState(false);
  return (
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
        value={isThrowing}
        onChange={setIsThrowing}
        color={color}
      />
      <AppMetricsRoot errorBoundaryFallback={null}>
        <text className="info-text">Inside AppMetricsRoot, markFirstRender ran on mount.</text>
      </AppMetricsRoot>
      <AppMetricsErrorBoundary
        fallback={({ error, resetError }) => (
          <view>
            <text testID="app-metrics-boundary-message" className="info-text">
              {`caught: ${error instanceof Error ? error.message : String(error)}`}
            </text>
            <ActionButton
              testID="app-metrics-reset-button"
              title="resetError"
              onPress={() => {
                setIsThrowing(false);
                resetError();
              }}
              color={color}
            />
          </view>
        )}
      >
        {isThrowing && <Thrower />}
      </AppMetricsErrorBoundary>
    </Scenario>
  );
}

export function AppMetricsScreen() {
  return (
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
  );
}
