<script lang="ts">
  import { VideoView, useVideoPlayer } from '@symbiote-native/video/svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import { usePlayerEvent } from './video-parts';

  // Only the active item has a source, the others unload, which is what a recycled feed does
  const { uri, isActive, index }: { uri: string; isActive: boolean; index: number } = $props();

  const player = useVideoPlayer(
    () => (isActive ? uri : null),
    instance => {
      instance.loop = true;
      instance.muted = true;
      instance.play();
    },
  );
  const status = usePlayerEvent(player, 'statusChange', { status: player.current.status });
</script>

<view class="vid-feed-item">
  <VideoView testID={`video-reel-${String(index)}`} player={player.current} nativeControls={false} contentFit="cover" class="vid-small" />
  <ResultRow testID={`video-reel-status-${String(index)}`} label={`Clip ${String(index + 1)}`} value={isActive ? status.current.status : 'unloaded'} />
</view>
