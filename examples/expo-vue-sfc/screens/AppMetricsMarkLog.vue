<script setup lang="ts">
import { ref } from 'vue';
import {
  clearStoredEntries,
  logEvent,
  markFirstRender,
  markInteractive,
  setGlobalAttributes,
} from '@symbiote-native/app-metrics/vue';
import type { ILogSeverity } from '@symbiote-native/app-metrics/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { SEVERITY_CHOICES, parseAttributes } from './app-metrics-helpers';

const color = lineColorOf(ROUTE_NAME.AppMetrics);

const routeName = ref('AppMetrics');
const params = ref('{"demo": true}');
const name = ref('canary_event');
const displayName = ref('Canary event');
const body = ref('Logged from the canary');
const attributes = ref('{"screen": "AppMetrics"}');
const globalAttributes = ref('{"build": "canary"}');
const severity = ref<ILogSeverity>('info');

const markCalls = [
  { label: 'markFirstRender', run: async () => markFirstRender() },
  {
    label: 'markInteractive',
    run: async () =>
      markInteractive({
        routeName: routeName.value,
        params: parseAttributes(params.value) ?? undefined,
      }),
  },
  { label: 'clearStoredEntries', run: () => clearStoredEntries() },
];

const logCalls = [
  {
    label: 'logEvent',
    run: async () =>
      logEvent(name.value, {
        displayName: displayName.value,
        body: body.value,
        attributes: parseAttributes(attributes.value),
        severity: severity.value,
      }),
  },
  {
    label: 'setGlobalAttributes',
    run: async () => setGlobalAttributes(parseAttributes(globalAttributes.value)),
  },
  { label: 'setGlobalAttributes(null)', run: async () => setGlobalAttributes(null) },
];
</script>

<template>
  <Card testID="app-metrics-mark-card" title="Startup marks">
    <Field
      testID="app-metrics-route-input"
      label="routeName"
      :value="routeName"
      :onChange="next => (routeName = next)"
    />
    <Field
      testID="app-metrics-params-input"
      label="params (JSON object)"
      :value="params"
      :onChange="next => (params = next)"
    />
  </Card>
  <CallConsole prefix="app-metrics-mark" title="Marks and storage" :color="color" :calls="markCalls" />
  <Card testID="app-metrics-log-card" title="Log events">
    <Field
      testID="app-metrics-log-name-input"
      label="event name"
      :value="name"
      :onChange="next => (name = next)"
    />
    <Field
      testID="app-metrics-log-display-input"
      label="displayName"
      :value="displayName"
      :onChange="next => (displayName = next)"
    />
    <Field
      testID="app-metrics-log-body-input"
      label="body"
      :value="body"
      :onChange="next => (body = next)"
    />
    <Field
      testID="app-metrics-log-attributes-input"
      label="attributes (JSON object)"
      :value="attributes"
      :onChange="next => (attributes = next)"
    />
    <ChoiceRow
      testID="app-metrics-severity"
      label="severity"
      :options="SEVERITY_CHOICES"
      :value="severity"
      :onChange="next => (severity = next)"
      :color="color"
    />
    <Field
      testID="app-metrics-global-input"
      label="global attributes (JSON object, empty clears)"
      :value="globalAttributes"
      :onChange="next => (globalAttributes = next)"
    />
  </Card>
  <CallConsole prefix="app-metrics-log" title="Logging calls" :color="color" :calls="logCalls" />
</template>
