<script lang="ts">
  import {
    getPendingResultAsync,
    launchCameraAsync,
    launchImageLibraryAsync,
  } from '@symbiote-native/image-picker/svelte';
  import type { IImagePickerAsset } from '@symbiote-native/image-picker/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { toPickerOptions } from './image-picker-form';
  import type { IForm } from './image-picker-form';
  import ImagePickerAsset from './ImagePickerAsset.svelte';

  let { form, color }: { form: IForm; color: string } = $props();

  let status = $state('idle');
  let assets = $state<IImagePickerAsset[]>([]);

  function launch(launcher: typeof launchImageLibraryAsync): void {
    status = 'picker open…';
    launcher(toPickerOptions(form))
      .then(result => {
        status = result.canceled ? 'canceled' : `picked ${result.assets.length}`;
        assets = result.canceled ? [] : result.assets;
      })
      .catch((error: Error) => {
        status = `failed: ${error.message}`;
      });
  }

  function handlePending(): void {
    getPendingResultAsync()
      .then(pending => {
        status = pending === null ? 'no pending result' : JSON.stringify(pending);
      })
      .catch((error: Error) => {
        status = `failed: ${error.message}`;
      });
  }
</script>

<Scenario
  testID="image-picker-result-card"
  title="Choose a profile photo or take a new one"
  why="Avatars, receipts and attachments start with a photo. The picker gives the app only what the user chooses, so it needs no broad access to the whole library."
  steps={['Press launchImageLibraryAsync and pick a photo', 'Press launchCameraAsync and take one (needs a real camera)', 'Cancel once']}
  expect="The status says picked N and each photo shows its size and file URI with a preview. Cancelling says canceled."
>
  <ActionButton testID="image-picker-library-button" title="launchImageLibraryAsync" onPress={() => launch(launchImageLibraryAsync)} {color} />
  <ActionButton testID="image-picker-camera-button" title="launchCameraAsync" onPress={() => launch(launchCameraAsync)} {color} />
  <ActionButton testID="image-picker-pending-button" title="getPendingResultAsync (Android)" onPress={handlePending} {color} />
  <ResultRow testID="image-picker-status" label="canceled / assets" value={status} />
  {#each assets as asset, index (asset.uri)}
    <ImagePickerAsset {asset} {index} />
  {/each}
</Scenario>
