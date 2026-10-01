<script setup lang="ts">
import Explorer from '../components/Explorer.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import AudioModuleCalls from './AudioModuleCalls.vue';
import AudioPlaybackScenario from './AudioPlaybackScenario.vue';
import AudioPlayerCards from './AudioPlayerCards.vue';
import AudioPlaylistCards from './AudioPlaylistCards.vue';
import AudioRecorderCards from './AudioRecorderCards.vue';
import AudioRecordingScenario from './AudioRecordingScenario.vue';
import AudioStreamCards from './AudioStreamCards.vue';

const ROUTE = ROUTE_NAME.Audio;
const color = lineColorOf(ROUTE);
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="audio-scroll"
    title="Audio"
    body="Play music and podcasts, queue playlists, record voice notes and stream the microphone. Audio session modes, permissions and preloading are in the explorer."
  >
    <AudioPlaybackScenario />
    <AudioRecordingScenario />
    <Explorer testID="audio-explorer" :color="color">
      <AudioModuleCalls />
      <AudioStreamCards />
      <AudioPlayerCards />
      <AudioRecorderCards />
      <AudioPlaylistCards />
    </Explorer>
  </ScreenShell>
</template>
