<script setup lang="ts">
import { VideoView, useVideoPlayer } from '@symbiote-native/video/vue';
import Scenario from '../components/Scenario.vue';
import PlayerStatusRows from './PlayerStatusRows.vue';
import { MP4_URI, TIME_UPDATE_SECONDS } from './video-shared';

const player = useVideoPlayer(
  () => MP4_URI,
  instance => {
    instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
  },
);
</script>

<template>
  <Scenario
    testID="video-basic-scenario"
    title="Play a video with the system controls"
    why="The quickest video screen: one source, native play, seek, fullscreen and subtitles buttons. Lessons, trailers and tutorials need nothing more."
    :steps="['Press play on the native controls', 'Drag the progress bar', 'Press pause']"
    expect="The video plays with sound, the lines below follow it live: status goes loading, readyToPlay, playing turns true, the time moves, and pause turns playing back to false."
  >
    <VideoView
      testID="video-basic"
      :player="player"
      :nativeControls="true"
      contentFit="contain"
      class="vid-video"
    />
    <PlayerStatusRows
      :player="player"
      prefix="video-basic"
    />
  </Scenario>
</template>
