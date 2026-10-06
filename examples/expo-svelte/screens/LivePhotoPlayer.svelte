<script lang="ts">
  import { LivePhotoView } from '@symbiote-native/live-photo/svelte';
  import type { ILivePhotoAsset, ILivePhotoContentFit, ILivePhotoViewHandle } from '@symbiote-native/live-photo/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Explorer from '../components/Explorer.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { FIT_OPTIONS, errorLine, pushLogLine } from './live-photo-shared';

  const { source, color }: { source: ILivePhotoAsset | null; color: string } = $props();

  let handle = $state<ILivePhotoViewHandle | undefined>();
  let lines = $state<string[]>([]);
  let isMuted = $state(true);
  let isGesture = $state(true);
  let fit = $state<ILivePhotoContentFit>('contain');

  function log(line: string): void {
    lines = pushLogLine(lines, line);
  }

  function guard(action: () => void): void {
    try {
      action();
    } catch (error: unknown) {
      log(`failed: ${errorLine(error)}`);
    }
  }
</script>

<Card testID="live-photo-player-card" title="The Live Photo view">
  {#if source === null}
    <view testID="live-photo-placeholder" class="live-placeholder">
      <text class="hero-body">Pick or load a Live Photo above, it is shown here.</text>
    </view>
  {:else}
    <LivePhotoView
      testID="live-photo-view"
      bind:this={handle}
      class="live-view"
      {source}
      {isMuted}
      contentFit={fit}
      useDefaultGestureRecognizer={isGesture}
      onLoadStart={() => log('load start')}
      onPreviewPhotoLoad={() => log('preview photo loaded')}
      onLoadComplete={() => log('ready to play')}
      onLoadError={error => log(`load error: ${error.message}`)}
      onPlaybackStart={() => log('playback start')}
      onPlaybackStop={() => log('playback stop')}
    />
  {/if}
  <view class="button-row">
    <ActionButton testID="live-photo-hint" title="Play a hint" {color} onPress={() => guard(() => handle?.startPlayback('hint'))} />
    <ActionButton testID="live-photo-full" title="Play fully" {color} onPress={() => guard(() => handle?.startPlayback('full'))} />
    <ActionButton testID="live-photo-stop" title="Stop" {color} onPress={() => guard(() => handle?.stopPlayback())} />
  </view>
  {#if lines.length === 0}
    <ResultRow testID="live-photo-log-empty" label="Events" value="none yet" />
  {:else}
    {#each lines as line (line)}
      <ResultRow testID="live-photo-log" label="event" value={line} />
    {/each}
  {/if}
  <Explorer testID="live-photo-explorer" {color}>
    <ToggleRow testID="live-photo-muted" label="isMuted" value={isMuted} onChange={value => (isMuted = value)} {color} />
    <ToggleRow testID="live-photo-gesture" label="useDefaultGestureRecognizer: press and hold plays" value={isGesture} onChange={value => (isGesture = value)} {color} />
    <ChoiceRow testID="live-photo-fit" label="contentFit" {color} value={fit} options={FIT_OPTIONS} onChange={value => (fit = value)} />
  </Explorer>
</Card>
