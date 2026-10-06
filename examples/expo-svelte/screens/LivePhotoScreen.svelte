<script lang="ts">
  import { Platform } from '@symbiote-native/svelte';
  import type { ILivePhotoAsset } from '@symbiote-native/live-photo/svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import LivePhotoLibraryScenario from './LivePhotoLibraryScenario.svelte';
  import LivePhotoPickScenario from './LivePhotoPickScenario.svelte';
  import LivePhotoPlayer from './LivePhotoPlayer.svelte';

  const ROUTE = ROUTE_NAME.LivePhoto;
  const IS_IOS = Platform.select({ ios: true, default: false });
  const color = lineColorOf(ROUTE);

  let source = $state.raw<ILivePhotoAsset | null>(null);
</script>

<ScreenShell
  route={ROUTE}
  testID="live-photo-scroll"
  title="Live Photo"
  body="iOS only: show an Apple Live Photo, play its motion on a press and react to loading and playback events. It needs a Live Photo on the device, take one with the Camera app."
>
  {#if !IS_IOS}
    <ResultRow testID="live-photo-platform" label="Platform" value="Live Photos exist on iOS only, the view renders nothing here" />
  {/if}
  <LivePhotoPickScenario onPicked={asset => (source = asset)} {color} />
  <LivePhotoLibraryScenario onFound={asset => (source = asset)} {color} />
  <LivePhotoPlayer {source} {color} />
</ScreenShell>
