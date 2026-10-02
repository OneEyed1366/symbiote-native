import { defineComponent, ref, shallowRef } from 'vue';
import {
  NetworkRequestObserver,
  getAllCrashReports,
  getForegroundSession,
  getInactiveSessions,
  getMainSession,
  useNetworkRequestObserver,
} from '@symbiote-native/app-metrics/vue';
import type {
  INetworkRequestCompletedEvent,
  INetworkRequestStartedEvent,
  Session,
} from '@symbiote-native/app-metrics/vue';
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

export const SessionCalls = defineComponent(
  () => {
    const category = ref('canary');
    const name = ref('button_press');
    const value = ref('1');
    const routeName = ref('AppMetrics');

    return () => (
      <>
        <Card testID="app-metrics-metric-card" title="Session.addMetric input">
          <Field testID="app-metrics-metric-category-input" label="category" value={category.value} onChange={next => { category.value = next; }} />
          <Field testID="app-metrics-metric-name-input" label="name" value={name.value} onChange={next => { name.value = next; }} />
          <Field testID="app-metrics-metric-value-input" label="value" value={value.value} onChange={next => { value.value = next; }} />
          <Field testID="app-metrics-metric-route-input" label="routeName" value={routeName.value} onChange={next => { routeName.value = next; }} />
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
                  category: category.value,
                  name: name.value,
                  value: Number(value.value),
                  routeName: routeName.value,
                }),
            },
            { label: 'getAllCrashReports (Android)', run: () => getAllCrashReports() },
          ]}
        />
      </>
    );
  },
  { name: 'SessionCalls' },
);

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

type IHookObserverProps = {
  hosts: string;
  methods: string;
  onLine: (line: string) => void;
};

const HookObserver = defineComponent<IHookObserverProps>(
  props => {
    useNetworkRequestObserver(() => ({
      filter: { hosts: splitList(props.hosts), methods: splitList(props.methods) },
      onStarted: event => props.onLine(describeStarted(event)),
      onCompleted: event => props.onLine(describeCompleted(event)),
    }));
    return () => null;
  },
  { name: 'HookObserver', props: ['hosts', 'methods', 'onLine'] },
);

export const NetworkObserverCard = defineComponent(
  () => {
    const hosts = ref('');
    const methods = ref('');
    const isHookOn = ref(false);
    const probeUrl = ref(DEFAULT_PROBE_URL);
    const lines = ref<string[]>([]);
    const direct = shallowRef<NetworkRequestObserver | null>(null);
    const pushLine = (line: string) => {
      lines.value = [line, ...lines.value].slice(0, MAX_LOGGED_EVENTS);
    };

    const toggleDirect = () => {
      const current = direct.value;
      if (current !== null) {
        current.release();
        direct.value = null;
        return;
      }
      const observer = new NetworkRequestObserver({ hosts: splitList(hosts.value), methods: splitList(methods.value) });
      observer.addListener('requestCompleted', event => pushLine(`direct ${describeCompleted(event)}`));
      direct.value = observer;
    };

    return () => (
      <Card testID="app-metrics-network-card" title="NetworkRequestObserver">
        <Field testID="app-metrics-hosts-input" label="filter.hosts (comma separated)" value={hosts.value} onChange={next => { hosts.value = next; }} placeholder="example.com" />
        <Field testID="app-metrics-methods-input" label="filter.methods (comma separated)" value={methods.value} onChange={next => { methods.value = next; }} placeholder="GET, POST" />
        <ToggleRow
          testID="app-metrics-hook-switch"
          label="useNetworkRequestObserver (onStarted, onCompleted)"
          value={isHookOn.value}
          onChange={next => { isHookOn.value = next; }}
          color={color}
        />
        {isHookOn.value && <HookObserver hosts={hosts.value} methods={methods.value} onLine={pushLine} />}
        <ActionButton
          testID="app-metrics-direct-button"
          title={direct.value === null ? 'new NetworkRequestObserver(filter)' : 'release the direct observer'}
          onPress={toggleDirect}
          color={color}
        />
        <ActionButton
          testID="app-metrics-set-filter-button"
          title="setFilter(current fields)"
          onPress={() => direct.value?.setFilter({ hosts: splitList(hosts.value), methods: splitList(methods.value) })}
          color={color}
        />
        <Field testID="app-metrics-probe-input" label="request to fire" value={probeUrl.value} onChange={next => { probeUrl.value = next; }} />
        <ActionButton
          testID="app-metrics-fetch-button"
          title="fetch(url)"
          onPress={() => {
            fetch(probeUrl.value).catch((error: Error) => pushLine(`fetch failed: ${error.message}`));
          }}
          color={color}
        />
        <ResultRow testID="app-metrics-network-log" label="events" value={lines.value.length === 0 ? 'none yet' : lines.value.join('\n')} />
      </Card>
    );
  },
  { name: 'NetworkObserverCard' },
);
