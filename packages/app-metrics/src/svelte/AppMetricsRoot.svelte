<script lang="ts">
  // Marks the first render so time-to-first-render is measured without a manual call, the
  // Svelte twin of ../react's AppMetricsRoot and ../vue's
  import { onMount } from 'svelte';
  import { markFirstRender } from '../core';
  import AppMetricsErrorBoundary from './AppMetricsErrorBoundary.svelte';
  import type { IAppMetricsRootProps } from './app-metrics-root-props';

  let { errorBoundaryFallback, children: rootChildren }: IAppMetricsRootProps =
    $props();

  onMount(() => markFirstRender());
</script>

{#if errorBoundaryFallback !== undefined}
  <AppMetricsErrorBoundary fallback={errorBoundaryFallback}>
    {@render rootChildren()}
  </AppMetricsErrorBoundary>
{:else}
  {@render rootChildren()}
{/if}
