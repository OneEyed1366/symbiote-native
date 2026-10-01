<script lang="ts">
  import { NetworkRequestObserver } from '@symbiote-native/app-metrics/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Card from '../components/Card.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import AppMetricsHookObserver from './AppMetricsHookObserver.svelte';
  import { DEFAULT_PROBE_URL, describeCompleted, splitList } from './app-metrics-network';

  const color = lineColorOf(ROUTE_NAME.AppMetrics);
  const MAX_LOGGED_EVENTS = 10;

  let hosts = $state('');
  let methods = $state('');
  let isHookOn = $state(false);
  let probeUrl = $state(DEFAULT_PROBE_URL);
  let lines = $state<string[]>([]);
  let direct = $state.raw<NetworkRequestObserver | null>(null);

  function pushLine(line: string): void {
    lines = [line, ...lines].slice(0, MAX_LOGGED_EVENTS);
  }

  function toggleDirect(): void {
    if (direct !== null) {
      direct.release();
      direct = null;
      return;
    }
    const observer = new NetworkRequestObserver({
      hosts: splitList(hosts),
      methods: splitList(methods),
    });
    observer.addListener('requestCompleted', event => pushLine(`direct ${describeCompleted(event)}`));
    direct = observer;
  }
</script>

<Card testID="app-metrics-network-card" title="NetworkRequestObserver">
  <Field testID="app-metrics-hosts-input" label="filter.hosts (comma separated)" value={hosts} onChange={next => (hosts = next)} placeholder="example.com" />
  <Field testID="app-metrics-methods-input" label="filter.methods (comma separated)" value={methods} onChange={next => (methods = next)} placeholder="GET, POST" />
  <ToggleRow
    testID="app-metrics-hook-switch"
    label="useNetworkRequestObserver (onStarted, onCompleted)"
    value={isHookOn}
    onChange={next => (isHookOn = next)}
    {color}
  />
  {#if isHookOn}
    <AppMetricsHookObserver {hosts} {methods} onLine={pushLine} />
  {/if}
  <ActionButton
    testID="app-metrics-direct-button"
    title={direct === null ? 'new NetworkRequestObserver(filter)' : 'release the direct observer'}
    onPress={toggleDirect}
    {color}
  />
  <ActionButton
    testID="app-metrics-set-filter-button"
    title="setFilter(current fields)"
    onPress={() => direct?.setFilter({ hosts: splitList(hosts), methods: splitList(methods) })}
    {color}
  />
  <Field testID="app-metrics-probe-input" label="request to fire" value={probeUrl} onChange={next => (probeUrl = next)} />
  <ActionButton
    testID="app-metrics-fetch-button"
    title="fetch(url)"
    onPress={() => {
      fetch(probeUrl).catch((error: Error) => pushLine(`fetch failed: ${error.message}`));
    }}
    {color}
  />
  <ResultRow testID="app-metrics-network-log" label="events" value={lines.length === 0 ? 'none yet' : lines.join('\n')} />
</Card>
