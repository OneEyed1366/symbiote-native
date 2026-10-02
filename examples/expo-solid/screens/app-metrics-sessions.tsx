import { Show, createSignal } from 'solid-js';
import {
  NetworkRequestObserver,
  getAllCrashReports,
  getForegroundSession,
  getInactiveSessions,
  getMainSession,
  useNetworkRequestObserver,
} from '@symbiote-native/app-metrics/solid';
import type {
  INetworkRequestCompletedEvent,
  INetworkRequestStartedEvent,
  Session,
} from '@symbiote-native/app-metrics/solid';
import { ActionButton } from '../components/ActionButton';
import { CallConsole } from '../components/CallConsole';
import {
  Card,
  Field,
  ResultRow,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.AppMetrics);
const MAX_LOGGED_EVENTS = 10;
const DEFAULT_PROBE_URL = 'https://example.com/';

function sessionSummary(session: Session) {
  return { id: session.id, type: session.type, startDate: session.startDate };
}

export function SessionCalls() {
  const [category, setCategory] = createSignal('canary');
  const [name, setName] = createSignal('button_press');
  const [value, setValue] = createSignal('1');
  const [routeName, setRouteName] = createSignal('AppMetrics');

  return (
    <>
      <Card testID="app-metrics-metric-card" title="Session.addMetric input">
        <Field testID="app-metrics-metric-category-input" label="category" value={category()} onChange={setCategory} />
        <Field testID="app-metrics-metric-name-input" label="name" value={name()} onChange={setName} />
        <Field testID="app-metrics-metric-value-input" label="value" value={value()} onChange={setValue} />
        <Field testID="app-metrics-metric-route-input" label="routeName" value={routeName()} onChange={setRouteName} />
      </Card>
      <CallConsole
        prefix="app-metrics-sessions"
        title="Sessions"
        color={color}
        calls={[
          { label: 'getMainSession', run: async () => sessionSummary(getMainSession()) },
          {
            label: 'getForegroundSession',
            run: async () => {
              const session = await getForegroundSession();
              return session && sessionSummary(session);
            },
          },
          { label: 'getInactiveSessions', run: async () => (await getInactiveSessions()).map(item => ({ id: item.id, type: item.type, metrics: item.metrics.length, logs: item.logs.length })) },
          { label: 'isActive', run: () => getMainSession().isActive() },
          { label: 'getEndDate', run: () => getMainSession().getEndDate() },
          { label: 'getMetrics', run: () => getMainSession().getMetrics() },
          { label: 'getLogs', run: () => getMainSession().getLogs() },
          {
            label: 'addMetric',
            run: () =>
              getMainSession().addMetric({
                timestamp: new Date().toISOString(),
                category: category(),
                name: name(),
                value: Number(value()),
                routeName: routeName(),
              }),
          },
          { label: 'getAllCrashReports (Android)', run: () => getAllCrashReports() },
        ]}
      />
    </>
  );
}

function describeStarted(event: INetworkRequestStartedEvent): string {
  return `started ${event.method} ${event.url}`;
}

function describeCompleted(event: INetworkRequestCompletedEvent): string {
  return `completed ${event.method} ${event.url} -> ${event.statusCode} in ${event.totalDuration}ms`;
}

function splitList(text: string): string[] | null {
  const items = text
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
  return items.length === 0 ? null : items;
}

function HookObserver(props: { hosts: string; methods: string; onLine: (line: string) => void }) {
  useNetworkRequestObserver(() => ({
    filter: { hosts: splitList(props.hosts), methods: splitList(props.methods) },
    onStarted: event => props.onLine(describeStarted(event)),
    onCompleted: event => props.onLine(describeCompleted(event)),
  }));
  return null;
}

export function NetworkObserverCard() {
  const [hosts, setHosts] = createSignal('');
  const [methods, setMethods] = createSignal('');
  const [isHookOn, setIsHookOn] = createSignal(false);
  const [probeUrl, setProbeUrl] = createSignal(DEFAULT_PROBE_URL);
  const [lines, setLines] = createSignal<string[]>([]);
  const [direct, setDirect] = createSignal<NetworkRequestObserver | null>(null);
  const pushLine = (line: string) =>
    setLines(previous => [line, ...previous].slice(0, MAX_LOGGED_EVENTS));

  const toggleDirect = () => {
    const current = direct();
    if (current !== null) {
      current.release();
      setDirect(null);
      return;
    }
    const observer = new NetworkRequestObserver({ hosts: splitList(hosts()), methods: splitList(methods()) });
    observer.addListener('requestCompleted', event => pushLine(`direct ${describeCompleted(event)}`));
    setDirect(observer);
  };

  return (
    <Card testID="app-metrics-network-card" title="NetworkRequestObserver">
      <Field testID="app-metrics-hosts-input" label="filter.hosts (comma separated)" value={hosts()} onChange={setHosts} placeholder="example.com" />
      <Field testID="app-metrics-methods-input" label="filter.methods (comma separated)" value={methods()} onChange={setMethods} placeholder="GET, POST" />
      <ToggleRow
        testID="app-metrics-hook-switch"
        label="useNetworkRequestObserver (onStarted, onCompleted)"
        value={isHookOn()}
        onChange={setIsHookOn}
        color={color}
      />
      <Show when={isHookOn()}>
        <HookObserver hosts={hosts()} methods={methods()} onLine={pushLine} />
      </Show>
      <ActionButton
        testID="app-metrics-direct-button"
        title={direct() === null ? 'new NetworkRequestObserver(filter)' : 'release the direct observer'}
        onPress={toggleDirect}
        color={color}
      />
      <ActionButton
        testID="app-metrics-set-filter-button"
        title="setFilter(current fields)"
        onPress={() => direct()?.setFilter({ hosts: splitList(hosts()), methods: splitList(methods()) })}
        color={color}
      />
      <Field testID="app-metrics-probe-input" label="request to fire" value={probeUrl()} onChange={setProbeUrl} />
      <ActionButton
        testID="app-metrics-fetch-button"
        title="fetch(url)"
        onPress={() => {
          fetch(probeUrl()).catch((error: Error) => pushLine(`fetch failed: ${error.message}`));
        }}
        color={color}
      />
      <ResultRow testID="app-metrics-network-log" label="events" value={lines().length === 0 ? 'none yet' : lines().join('\n')} />
    </Card>
  );
}
