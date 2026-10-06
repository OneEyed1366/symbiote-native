<script lang="ts">
  import type { ICameraCapturedPicture } from '@symbiote-native/camera/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { QUALITIES, errorLine } from './camera-shared';
  import type { ICameraDeck } from './camera-shared';

  const { deck, color }: { deck: ICameraDeck; color: string } = $props();

  let picture = $state.raw<ICameraCapturedPicture | null>(null);
  let quality = $state(0.7);
  let isSilent = $state(false);
  let isRaw = $state(false);
  let line = $state('no photo yet');

  async function shoot(): Promise<void> {
    line = 'shooting…';
    try {
      const result = await deck.camera?.takePictureAsync({ quality, shutterSound: !isSilent, skipProcessing: isRaw, exif: true });
      picture = result ?? null;
      line = result === undefined ? 'no picture returned' : `${result.width}x${result.height} ${result.format}`;
    } catch (error) {
      line = `failed: ${errorLine(error)}`;
    }
  }
</script>

<Scenario
  testID="camera-photo-scenario"
  title="Take a photo for a profile, a receipt or a document"
  why="The core camera task. The app shows a live preview, takes a still on a button and gets a file it can upload or show. Quality trades size for sharpness."
  steps={['Allow the camera and wait for the preview', 'Press Take photo', 'Change the quality to 0.3 and shoot again']}
  expect="A thumbnail of the shot appears with its pixel size. Quality 0.3 gives the same pixel size as 1, only the file gets smaller and softer."
>
  <ChoiceRow testID="camera-quality" label="quality" {color} value={quality} options={QUALITIES} onChange={value => (quality = value)} />
  <ToggleRow testID="camera-silent" label="shutter sound off (not allowed everywhere)" value={isSilent} onChange={value => (isSilent = value)} {color} />
  <ToggleRow testID="camera-raw" label="skipProcessing: the raw sensor image" value={isRaw} onChange={value => (isRaw = value)} {color} />
  <ActionButton testID="camera-take-photo" title="Take photo" {color} onPress={shoot} />
  <ResultRow testID="camera-photo-result" label="takePictureAsync" value={line} />
  {#if picture !== null}
    <image testID="camera-photo" source={{ uri: picture.uri }} class="cam-photo" />
    {#if picture.exif !== undefined}
      <ResultRow testID="camera-photo-exif" label="EXIF tags" value={String(Object.keys(picture.exif).length)} />
    {/if}
  {/if}
</Scenario>
