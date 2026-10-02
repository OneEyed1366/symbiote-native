<script setup lang="ts">
import { ref } from 'vue';
import { reportError } from '@symbiote-native/app-metrics/vue';
import type { IReportErrorInput } from '@symbiote-native/app-metrics/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { SOURCE_CHOICES } from './app-metrics-helpers';

const color = lineColorOf(ROUTE_NAME.AppMetrics);

const source = ref<IReportErrorInput['source']>('reportedByUser');
const type = ref('CanaryError');
const message = ref('Reported from the canary');
const stacktrace = ref('at ReportCard (AppMetricsScreen.tsx)');
const componentStack = ref('');
const isFatal = ref(false);

const calls = [
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
];
</script>

<template>
  <Card testID="app-metrics-report-card" title="reportError input">
    <ChoiceRow
      testID="app-metrics-source"
      label="source"
      :options="SOURCE_CHOICES"
      :value="source"
      :onChange="next => (source = next)"
      :color="color"
    />
    <Field
      testID="app-metrics-type-input"
      label="type"
      :value="type"
      :onChange="next => (type = next)"
    />
    <Field
      testID="app-metrics-message-input"
      label="message"
      :value="message"
      :onChange="next => (message = next)"
    />
    <Field
      testID="app-metrics-stack-input"
      label="stacktrace"
      :value="stacktrace"
      :onChange="next => (stacktrace = next)"
    />
    <Field
      testID="app-metrics-component-stack-input"
      label="componentStack"
      :value="componentStack"
      :onChange="next => (componentStack = next)"
    />
    <ToggleRow
      testID="app-metrics-fatal-switch"
      label="isFatal"
      :value="isFatal"
      :onChange="next => (isFatal = next)"
      :color="color"
    />
  </Card>
  <CallConsole prefix="app-metrics-report" title="Error reporting" :color="color" :calls="calls" />
</template>
