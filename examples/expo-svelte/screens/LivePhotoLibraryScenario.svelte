<script lang="ts">
  import type { ILivePhotoAsset } from '@symbiote-native/live-photo/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { findNewestLivePhoto } from './live-photo-shared';

  const { onFound, color }: { onFound: (asset: ILivePhotoAsset) => void; color: string } = $props();

  let line = $state('not loaded');

  async function load(): Promise<void> {
    line = 'asking for access…';
    const result = await findNewestLivePhoto();
    if (result.asset !== null) {
      onFound(result.asset);
    }
    line = result.line;
  }
</script>

<Scenario
  testID="live-photo-library-scenario"
  title="Show the newest Live Photo without a picker"
  why="A memories widget or a latest-photo header reads the library itself: it finds the newest Live Photo and shows it, with no picker sheet."
  steps={['Press Load the newest Live Photo and allow access']}
  expect="The newest Live Photo of the device appears in the view below, ready to play. Without a Live Photo the line explains it."
>
  <ActionButton testID="live-photo-library" title="Load the newest Live Photo" {color} onPress={load} />
  <ResultRow testID="live-photo-library-result" label="Library" value={line} />
</Scenario>
