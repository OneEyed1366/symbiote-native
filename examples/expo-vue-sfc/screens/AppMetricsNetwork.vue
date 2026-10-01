<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef } from 'vue';
import { NetworkRequestObserver } from '@symbiote-native/app-metrics/vue';
import ActionButton from '../components/ActionButton.vue';
import Card from '../components/Card.vue';
import Field from '../components/Field.vue';
import ResultRow from '../components/ResultRow.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import AppMetricsHookObserver from './AppMetricsHookObserver.vue';
import { DEFAULT_PROBE_URL, describeCompleted, splitList } from './app-metrics-network';

const color = lineColorOf(ROUTE_NAME.AppMetrics);
const MAX_LOGGED_EVENTS = 10;

const hosts = ref('');
const methods = ref('');
const isHookOn = ref(false);
const probeUrl = ref(DEFAULT_PROBE_URL);
const lines = ref<string[]>([]);
// The observer is a native-backed class instance, so it stays outside deep reactivity
const direct = shallowRef<NetworkRequestObserver | null>(null);

onUnmounted(() => direct.value?.release());

const directTitle = computed(() =>
  direct.value === null ? 'new NetworkRequestObserver(filter)' : 'release the direct observer',
);
const logText = computed(() => (lines.value.length === 0 ? 'none yet' : lines.value.join('\n')));

function pushLine(line: string): void {
  lines.value = [line, ...lines.value].slice(0, MAX_LOGGED_EVENTS);
}

function toggleDirect(): void {
  if (direct.value !== null) {
    direct.value.release();
    direct.value = null;
    return;
  }
  const observer = new NetworkRequestObserver({
    hosts: splitList(hosts.value),
    methods: splitList(methods.value),
  });
  observer.addListener('requestCompleted', event => pushLine(`direct ${describeCompleted(event)}`));
  direct.value = observer;
}

function setFilter(): void {
  direct.value?.setFilter({ hosts: splitList(hosts.value), methods: splitList(methods.value) });
}

function fireFetch(): void {
  fetch(probeUrl.value).catch((error: Error) => pushLine(`fetch failed: ${error.message}`));
}
</script>

<template>
  <Card testID="app-metrics-network-card" title="NetworkRequestObserver">
    <Field
      testID="app-metrics-hosts-input"
      label="filter.hosts (comma separated)"
      :value="hosts"
      :onChange="next => (hosts = next)"
      placeholder="example.com"
    />
    <Field
      testID="app-metrics-methods-input"
      label="filter.methods (comma separated)"
      :value="methods"
      :onChange="next => (methods = next)"
      placeholder="GET, POST"
    />
    <ToggleRow
      testID="app-metrics-hook-switch"
      label="useNetworkRequestObserver (onStarted, onCompleted)"
      :value="isHookOn"
      :onChange="next => (isHookOn = next)"
      :color="color"
    />
    <AppMetricsHookObserver v-if="isHookOn" :hosts="hosts" :methods="methods" :onLine="pushLine" />
    <ActionButton
      testID="app-metrics-direct-button"
      :title="directTitle"
      :onPress="toggleDirect"
      :color="color"
    />
    <ActionButton
      testID="app-metrics-set-filter-button"
      title="setFilter(current fields)"
      :onPress="setFilter"
      :color="color"
    />
    <Field
      testID="app-metrics-probe-input"
      label="request to fire"
      :value="probeUrl"
      :onChange="next => (probeUrl = next)"
    />
    <ActionButton
      testID="app-metrics-fetch-button"
      title="fetch(url)"
      :onPress="fireFetch"
      :color="color"
    />
    <ResultRow testID="app-metrics-network-log" label="events" :value="logText" />
  </Card>
</template>
