<script setup lang="ts">
import { VideoView, useVideoPlayer } from '@symbiote-native/video/vue';
import { CACHED_SOURCE } from './video-shared';

const player = useVideoPlayer(
  () => CACHED_SOURCE,
  instance => {
    instance.loop = true;
  },
);
</script>

<template>
  <VideoView
    testID="video-cached"
    :player="player"
    :nativeControls="true"
    class="vid-small"
  />
</template>
