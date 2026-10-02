<script setup lang="ts">
import { ref } from 'vue';
import {
  getAllCrashReports,
  getForegroundSession,
  getInactiveSessions,
  getMainSession,
} from '@symbiote-native/app-metrics/vue';
import type { Session } from '@symbiote-native/app-metrics/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import Field from '../components/Field.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.AppMetrics);

const category = ref('canary');
const name = ref('button_press');
const value = ref('1');
const routeName = ref('AppMetrics');

function sessionSummary(session: Session) {
  return { id: session.id, type: session.type, startDate: session.startDate };
}

const calls = [
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
        category: category.value,
        name: name.value,
        value: Number(value.value),
        routeName: routeName.value,
      }),
  },
  { label: 'getAllCrashReports (Android)', run: () => getAllCrashReports() },
];
</script>

<template>
  <Card testID="app-metrics-metric-card" title="Session.addMetric input">
    <Field
      testID="app-metrics-metric-category-input"
      label="category"
      :value="category"
      :onChange="next => (category = next)"
    />
    <Field
      testID="app-metrics-metric-name-input"
      label="name"
      :value="name"
      :onChange="next => (name = next)"
    />
    <Field
      testID="app-metrics-metric-value-input"
      label="value"
      :value="value"
      :onChange="next => (value = next)"
    />
    <Field
      testID="app-metrics-metric-route-input"
      label="routeName"
      :value="routeName"
      :onChange="next => (routeName = next)"
    />
  </Card>
  <CallConsole prefix="app-metrics-sessions" title="Sessions" :color="color" :calls="calls" />
</template>
