<script lang="ts">
  import type { ILivePhotoAsset } from '@symbiote-native/live-photo/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { pickLivePhoto } from './live-photo-shared';

  const { onPicked, color }: { onPicked: (asset: ILivePhotoAsset) => void; color: string } = $props();

  let line = $state('nothing picked');

  async function pick(): Promise<void> {
    line = 'opening the library…';
    const result = await pickLivePhoto();
    if (result.asset !== null) {
      onPicked(result.asset);
    }
    line = result.line;
  }
</script>

<Scenario
  testID="live-photo-pick-scenario"
  title="Let the user choose a Live Photo to view"
  why="A Live Photo is a still with a few seconds of motion around it. A gallery, a profile editor or a chat shows the chosen one and plays it on a press, as the Photos app does."
  steps={['Press Pick a Live Photo and choose one with the LIVE badge', 'Press and hold the picture below']}
  expect="The picked Live Photo shows as a still. While you hold a finger on it the motion plays with sound, and on release it settles back to the still."
>
  <ActionButton testID="live-photo-pick" title="Pick a Live Photo" {color} onPress={pick} />
  <ResultRow testID="live-photo-pick-result" label="Picker" value={line} />
</Scenario>
