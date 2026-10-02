<script setup lang="ts">
import { h, ref } from 'vue';
import { AppMetricsErrorBoundary, AppMetricsRoot } from '@symbiote-native/app-metrics/vue';
import type { IAppMetricsErrorBoundaryFallbackProps } from '@symbiote-native/app-metrics/vue';
import Explorer from '../components/Explorer.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import AppMetricsBoundaryFallback from './AppMetricsBoundaryFallback.vue';
import AppMetricsMarkLog from './AppMetricsMarkLog.vue';
import AppMetricsNetwork from './AppMetricsNetwork.vue';
import AppMetricsReport from './AppMetricsReport.vue';
import AppMetricsSessions from './AppMetricsSessions.vue';
import AppMetricsThrower from './AppMetricsThrower.vue';

const ROUTE = ROUTE_NAME.AppMetrics;
const color = lineColorOf(ROUTE);

const isThrowing = ref(false);

// The boundary takes a render function, so the fallback SFC is mounted through `h`
const renderFallback = ({ error, resetError }: IAppMetricsErrorBoundaryFallbackProps) =>
  h(AppMetricsBoundaryFallback, {
    error,
    color,
    resetError: () => {
      isThrowing.value = false;
      resetError();
    },
  });
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="app-metrics-scroll"
    title="App Metrics"
    body="Know how your app behaves in the field: startup timing, sessions, custom log events, handled and unhandled errors and network requests, sent to your metrics backend."
  >
    <Scenario
      testID="app-metrics-boundary-card"
      title="Catch a crash, report it and show a fallback instead of a white screen"
      why="A render error in one component should not kill the app. The boundary reports it to your metrics pipeline with the component stack and lets the user recover."
      :steps="['Turn on the throwing component', 'Read the caught message', 'Press resetError']"
      expect="The error is caught, its message is shown and reported. Pressing resetError renders the tree normally again."
    >
      <ToggleRow
        testID="app-metrics-throw-switch"
        label="render a component that throws"
        :value="isThrowing"
        :onChange="next => (isThrowing = next)"
        :color="color"
      />
      <AppMetricsRoot :errorBoundaryFallback="null">
        <text class="info-text">Inside AppMetricsRoot, markFirstRender ran on mount.</text>
      </AppMetricsRoot>
      <AppMetricsErrorBoundary :fallback="renderFallback">
        <AppMetricsThrower v-if="isThrowing" />
      </AppMetricsErrorBoundary>
    </Scenario>
    <Explorer testID="app-metrics-explorer" :color="color">
      <AppMetricsMarkLog />
      <AppMetricsReport />
      <AppMetricsSessions />
      <AppMetricsNetwork />
    </Explorer>
  </ScreenShell>
</template>
