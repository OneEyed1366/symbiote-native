<script lang="ts">
  import {
    clearStoredEntries,
    logEvent,
    markFirstRender,
    markInteractive,
    setGlobalAttributes,
  } from '@symbiote-native/app-metrics/svelte';
  import type { ILogSeverity } from '@symbiote-native/app-metrics/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { SEVERITY_CHOICES, parseAttributes } from './app-metrics-helpers';

  const color = lineColorOf(ROUTE_NAME.AppMetrics);

  let routeName = $state('AppMetrics');
  let params = $state('{"demo": true}');
  let name = $state('canary_event');
  let displayName = $state('Canary event');
  let body = $state('Logged from the canary');
  let attributes = $state('{"screen": "AppMetrics"}');
  let globalAttributes = $state('{"build": "canary"}');
  let severity = $state<ILogSeverity>('info');
</script>

<Card testID="app-metrics-mark-card" title="Startup marks">
  <Field testID="app-metrics-route-input" label="routeName" value={routeName} onChange={next => (routeName = next)} />
  <Field testID="app-metrics-params-input" label="params (JSON object)" value={params} onChange={next => (params = next)} />
</Card>
<CallConsole
  prefix="app-metrics-mark"
  title="Marks and storage"
  {color}
  calls={[
    { label: 'markFirstRender', run: async () => markFirstRender() },
    {
      label: 'markInteractive',
      run: async () =>
        markInteractive({ routeName, params: parseAttributes(params) ?? undefined }),
    },
    { label: 'clearStoredEntries', run: () => clearStoredEntries() },
  ]}
/>
<Card testID="app-metrics-log-card" title="Log events">
  <Field testID="app-metrics-log-name-input" label="event name" value={name} onChange={next => (name = next)} />
  <Field testID="app-metrics-log-display-input" label="displayName" value={displayName} onChange={next => (displayName = next)} />
  <Field testID="app-metrics-log-body-input" label="body" value={body} onChange={next => (body = next)} />
  <Field testID="app-metrics-log-attributes-input" label="attributes (JSON object)" value={attributes} onChange={next => (attributes = next)} />
  <ChoiceRow testID="app-metrics-severity" label="severity" options={SEVERITY_CHOICES} value={severity} onChange={next => (severity = next)} {color} />
  <Field testID="app-metrics-global-input" label="global attributes (JSON object, empty clears)" value={globalAttributes} onChange={next => (globalAttributes = next)} />
</Card>
<CallConsole
  prefix="app-metrics-log"
  title="Logging calls"
  {color}
  calls={[
    {
      label: 'logEvent',
      run: async () =>
        logEvent(name, {
          displayName,
          body,
          attributes: parseAttributes(attributes),
          severity,
        }),
    },
    {
      label: 'setGlobalAttributes',
      run: async () => setGlobalAttributes(parseAttributes(globalAttributes)),
    },
    { label: 'setGlobalAttributes(null)', run: async () => setGlobalAttributes(null) },
  ]}
/>
