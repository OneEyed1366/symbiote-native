<script lang="ts">
  import { VideoView, useVideoPlayer } from '@symbiote-native/video/svelte';
  import { CACHED_SOURCE } from './video-shared';

  const player = useVideoPlayer(
    () => CACHED_SOURCE,
    instance => {
      instance.loop = true;
    },
  );
</script>

<VideoView testID="video-cached" player={player.current} nativeControls class="vid-small" />
