import { useState } from 'react';
import {
  NetworkRequestObserver,
  getAllCrashReports,
  getForegroundSession,
  getInactiveSessions,
  getMainSession,
} from '@symbiote-native/app-metrics';
import type {
  INetworkRequestCompletedEvent,
  INetworkRequestStartedEvent,
  Session,
} from '@symbiote-native/app-metrics';
import { useNetworkRequestObserver } from '@symbiote-native/app-metrics/react';
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
  const [category, setCategory] = useState('canary');
  const [name, setName] = useState('button_press');
  const [value, setValue] = useState('1');
  const [routeName, setRouteName] = useState('AppMetrics');

  return (
    <>
      <Card testID="app-metrics-metric-card" title="Session.addMetric input">
        <Field testID="app-metrics-metric-category-input" label="category" value={category} onChange={setCategory} />
        <Field testID="app-metrics-metric-name-input" label="name" value={name} onChange={setName} />
        <Field testID="app-metrics-metric-value-input" label="value" value={value} onChange={setValue} />
        <Field testID="app-metrics-metric-route-input" label="routeName" value={routeName} onChange={setRouteName} />
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
                category,
                name,
                value: Number(value),
                routeName,
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

function HookObserver({ hosts, methods, onLine }: { hosts: string; methods: string; onLine: (line: string) => void }) {
  useNetworkRequestObserver({
    filter: { hosts: splitList(hosts), methods: splitList(methods) },
    onStarted: event => onLine(describeStarted(event)),
    onCompleted: event => onLine(describeCompleted(event)),
  });
  return null;
}

export function NetworkObserverCard() {
  const [hosts, setHosts] = useState('');
  const [methods, setMethods] = useState('');
  const [isHookOn, setIsHookOn] = useState(false);
  const [probeUrl, setProbeUrl] = useState(DEFAULT_PROBE_URL);
  const [lines, setLines] = useState<string[]>([]);
  const [direct, setDirect] = useState<NetworkRequestObserver | null>(null);
  const pushLine = (line: string) =>
    setLines(previous => [line, ...previous].slice(0, MAX_LOGGED_EVENTS));

  const toggleDirect = () => {
    if (direct !== null) {
      direct.release();
      setDirect(null);
      return;
    }
    const observer = new NetworkRequestObserver({ hosts: splitList(hosts), methods: splitList(methods) });
    observer.addListener('requestCompleted', event => pushLine(`direct ${describeCompleted(event)}`));
    setDirect(observer);
  };

  return (
    <Card testID="app-metrics-network-card" title="NetworkRequestObserver">
      <Field testID="app-metrics-hosts-input" label="filter.hosts (comma separated)" value={hosts} onChange={setHosts} placeholder="example.com" />
      <Field testID="app-metrics-methods-input" label="filter.methods (comma separated)" value={methods} onChange={setMethods} placeholder="GET, POST" />
      <ToggleRow
        testID="app-metrics-hook-switch"
        label="useNetworkRequestObserver (onStarted, onCompleted)"
        value={isHookOn}
        onChange={setIsHookOn}
        color={color}
      />
      {isHookOn && <HookObserver hosts={hosts} methods={methods} onLine={pushLine} />}
      <ActionButton
        testID="app-metrics-direct-button"
        title={direct === null ? 'new NetworkRequestObserver(filter)' : 'release the direct observer'}
        onPress={toggleDirect}
        color={color}
      />
      <ActionButton
        testID="app-metrics-set-filter-button"
        title="setFilter(current fields)"
        onPress={() => direct?.setFilter({ hosts: splitList(hosts), methods: splitList(methods) })}
        color={color}
      />
      <Field testID="app-metrics-probe-input" label="request to fire" value={probeUrl} onChange={setProbeUrl} />
      <ActionButton
        testID="app-metrics-fetch-button"
        title="fetch(url)"
        onPress={() => {
          fetch(probeUrl).catch((error: Error) => pushLine(`fetch failed: ${error.message}`));
        }}
        color={color}
      />
      <ResultRow testID="app-metrics-network-log" label="events" value={lines.length === 0 ? 'none yet' : lines.join('\n')} />
    </Card>
  );
}
