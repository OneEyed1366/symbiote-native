<script lang="ts">
  import { VideoView, useVideoPlayer } from '@symbiote-native/video/svelte';

  const { uri }: { uri: string } = $props();

  const player = useVideoPlayer(() => uri);
</script>

<VideoView testID="camera-recorded" player={player.current} nativeControls class="cam-photo" />
