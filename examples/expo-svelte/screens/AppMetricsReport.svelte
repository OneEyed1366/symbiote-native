<script lang="ts">
  import { reportError } from '@symbiote-native/app-metrics/svelte';
  import type { IReportErrorInput } from '@symbiote-native/app-metrics/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { SOURCE_CHOICES } from './app-metrics-helpers';

  const color = lineColorOf(ROUTE_NAME.AppMetrics);

  let source = $state<IReportErrorInput['source']>('reportedByUser');
  let type = $state('CanaryError');
  let message = $state('Reported from the canary');
  let stacktrace = $state('at ReportCard (AppMetricsScreen.tsx)');
  let componentStack = $state('');
  let isFatal = $state(false);
</script>

<Card testID="app-metrics-report-card" title="reportError input">
  <ChoiceRow testID="app-metrics-source" label="source" options={SOURCE_CHOICES} value={source} onChange={next => (source = next)} {color} />
  <Field testID="app-metrics-type-input" label="type" value={type} onChange={next => (type = next)} />
  <Field testID="app-metrics-message-input" label="message" value={message} onChange={next => (message = next)} />
  <Field testID="app-metrics-stack-input" label="stacktrace" value={stacktrace} onChange={next => (stacktrace = next)} />
  <Field testID="app-metrics-component-stack-input" label="componentStack" value={componentStack} onChange={next => (componentStack = next)} />
  <ToggleRow testID="app-metrics-fatal-switch" label="isFatal" value={isFatal} onChange={next => (isFatal = next)} {color} />
</Card>
<CallConsole
  prefix="app-metrics-report"
  title="Error reporting"
  {color}
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
