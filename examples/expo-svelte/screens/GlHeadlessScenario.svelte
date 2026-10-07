<script lang="ts">
  import ActionButton from '../components/ActionButton.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { renderOffscreen } from './gl-headless';
  import type { IHeadlessResult } from './gl-headless';

  const { color }: { color: string } = $props();

  let result = $state.raw<IHeadlessResult>({ snapshot: null, line: 'not run' });

  async function run(): Promise<void> {
    result = { snapshot: result.snapshot, line: 'rendering…' };
    const next = await renderOffscreen();
    result = { snapshot: next.snapshot ?? result.snapshot, line: next.line };
  }
</script>

<Scenario
  testID="gl-headless-scenario"
  title="Render an image with no view on screen"
  why="Thumbnails, charts for a report or an image effect for a share can be drawn in the background with a context that has no view, then saved as a file."
  steps={['Press Render offscreen']}
  expect="An orange square image with a violet square in its middle appears below, 256 by 256 pixels. No GL view was on screen while it was drawn."
>
  <ActionButton testID="gl-headless-run" title="Render offscreen" {color} onPress={run} />
  <ResultRow testID="gl-headless-result" label="createContextAsync" value={result.line} />
  {#if result.snapshot !== null}
    <image testID="gl-headless-image" source={{ uri: result.snapshot.localUri }} class="gl-snapshot" />
  {/if}
</Scenario>
