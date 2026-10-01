<script lang="ts">
  import {
    getAllCrashReports,
    getForegroundSession,
    getInactiveSessions,
    getMainSession,
  } from '@symbiote-native/app-metrics/svelte';
  import type { Session } from '@symbiote-native/app-metrics/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import Field from '../components/Field.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.AppMetrics);

  let category = $state('canary');
  let name = $state('button_press');
  let value = $state('1');
  let routeName = $state('AppMetrics');

  function sessionSummary(session: Session) {
    return { id: session.id, type: session.type, startDate: session.startDate };
  }
</script>

<Card testID="app-metrics-metric-card" title="Session.addMetric input">
  <Field testID="app-metrics-metric-category-input" label="category" value={category} onChange={next => (category = next)} />
  <Field testID="app-metrics-metric-name-input" label="name" value={name} onChange={next => (name = next)} />
  <Field testID="app-metrics-metric-value-input" label="value" value={value} onChange={next => (value = next)} />
  <Field testID="app-metrics-metric-route-input" label="routeName" value={routeName} onChange={next => (routeName = next)} />
</Card>
<CallConsole
  prefix="app-metrics-sessions"
  title="Sessions"
  {color}
  calls={[
    { label: 'getMainSession', run: async () => sessionSummary(getMainSession()) },
    {
      label: 'getForegroundSession',
      run: async () => {
        const session = await getForegroundSession();
        return session && sessionSummary(session);
      },
    },
    {
      label: 'getInactiveSessions',
      run: async () =>
        (await getInactiveSessions()).map(item => ({
          id: item.id,
          type: item.type,
          metrics: item.metrics.length,
          logs: item.logs.length,
        })),
    },
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
