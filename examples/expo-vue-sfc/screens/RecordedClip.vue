<script setup lang="ts">
import { VideoView, useVideoPlayer } from '@symbiote-native/video/vue';

const props = defineProps<{ uri: string }>();

const player = useVideoPlayer(() => props.uri);
</script>

<template>
  <VideoView
    testID="camera-recorded"
    :player="player"
    :nativeControls="true"
    class="cam-photo"
  />
</template>
