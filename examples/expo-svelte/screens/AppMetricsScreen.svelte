<script lang="ts">
  import { AppMetricsErrorBoundary, AppMetricsRoot } from '@symbiote-native/app-metrics/svelte';
  import type { IAppMetricsErrorBoundaryFallbackProps } from '@symbiote-native/app-metrics/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Explorer from '../components/Explorer.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import AppMetricsMarkLog from './AppMetricsMarkLog.svelte';
  import AppMetricsNetwork from './AppMetricsNetwork.svelte';
  import AppMetricsReport from './AppMetricsReport.svelte';
  import AppMetricsSessions from './AppMetricsSessions.svelte';
  import AppMetricsThrower from './AppMetricsThrower.svelte';

  const ROUTE = ROUTE_NAME.AppMetrics;
  const color = lineColorOf(ROUTE);

  let isThrowing = $state(false);
</script>

<ScreenShell
  route={ROUTE}
  testID="app-metrics-scroll"
  title="App Metrics"
  body="Know how your app behaves in the field: startup timing, sessions, custom log events, handled and unhandled errors and network requests, sent to your metrics backend."
>
  <Scenario
    testID="app-metrics-boundary-card"
    title="Catch a crash, report it and show a fallback instead of a white screen"
    why="A render error in one component should not kill the app. The boundary reports it to your metrics pipeline with the component stack and lets the user recover."
    steps={['Turn on the throwing component', 'Read the caught message', 'Press resetError']}
    expect="The error is caught, its message is shown and reported. Pressing resetError renders the tree normally again."
  >
    <ToggleRow
      testID="app-metrics-throw-switch"
      label="render a component that throws"
      value={isThrowing}
      onChange={next => {
        isThrowing = next;
      }}
      {color}
    />
    <AppMetricsRoot errorBoundaryFallback={null}>
      <text class="info-text">Inside AppMetricsRoot, markFirstRender ran on mount.</text>
    </AppMetricsRoot>
    <AppMetricsErrorBoundary>
      {#snippet fallback({ error, resetError }: IAppMetricsErrorBoundaryFallbackProps)}
        <view>
          <text testID="app-metrics-boundary-message" class="info-text">
            {`caught: ${error instanceof Error ? error.message : String(error)}`}
          </text>
          <ActionButton
            testID="app-metrics-reset-button"
            title="resetError"
            onPress={() => {
              isThrowing = false;
              resetError();
            }}
            {color}
          />
        </view>
      {/snippet}
      {#if isThrowing}
        <AppMetricsThrower />
      {/if}
    </AppMetricsErrorBoundary>
  </Scenario>
  <Explorer testID="app-metrics-explorer" {color}>
    <AppMetricsMarkLog />
    <AppMetricsReport />
    <AppMetricsSessions />
    <AppMetricsNetwork />
  </Explorer>
</ScreenShell>
