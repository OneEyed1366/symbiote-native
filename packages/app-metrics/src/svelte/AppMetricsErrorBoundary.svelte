<script lang="ts">
  // Records a render-phase error and renders `fallback` in place of the failed subtree - the
  // Svelte twin of ../react's AppMetricsErrorBoundary and ../vue's, over `<svelte:boundary>`
  import { reportCaughtError } from '../core/report-caught-error';
  import type { IAppMetricsErrorBoundaryProps } from './app-metrics-error-boundary-props';

  let { fallback, children }: IAppMetricsErrorBoundaryProps = $props();
</script>

<svelte:boundary onerror={(error) => reportCaughtError(error)}>
  {@render children()}
  {#snippet failed(error, reset)}
    {#if fallback}
      {@render fallback({ error, resetError: reset })}
    {/if}
  {/snippet}
</svelte:boundary>
