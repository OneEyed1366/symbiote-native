<script setup lang="ts">
import { computed } from 'vue';
import { useAudioPlayer, useAudioPlayerStatus } from '@symbiote-native/audio/vue';
import CallConsole from '../components/CallConsole.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { TRACK_URL } from './audio-player-calls';

const color = lineColorOf(ROUTE_NAME.Audio);
const SEEK_STEP_SECONDS = 10;

const player = useAudioPlayer(() => TRACK_URL);
const status = useAudioPlayerStatus(() => player.value);

const stateText = computed((): string => {
  if (status.value.playing) {
    return 'playing';
  }
  return status.value.isBuffering ? 'buffering' : 'paused';
});

const timeText = computed(
  () => `${status.value.currentTime.toFixed(1)} / ${status.value.duration.toFixed(1)} s`,
);

const calls = [
  { label: 'Play', run: async () => player.value.play() },
  { label: 'Pause', run: async () => player.value.pause() },
  {
    label: 'Skip forward 10 s',
    run: () => player.value.seekTo(player.value.currentTime + SEEK_STEP_SECONDS),
  },
];
</script>

<template>
  <Scenario
    testID="audio-playback-scenario"
    title="Play a song or a podcast episode"
    why="Stream a remote track with play, pause and seeking, and follow its progress. Keep playing with the screen locked after enabling background mode in the explorer."
    :steps="['Press Play', 'Press Skip forward 10 s', 'Press Pause']"
    expect="Audio plays, and the time row moves while it plays. Skipping jumps ten seconds and Pause freezes the time."
  >
    <CallConsole isBare prefix="audio-playback" title="Player" :color="color" :calls="calls" />
    <ResultRow testID="audio-playback-time" label="time" :value="timeText" />
    <ResultRow testID="audio-playback-state" label="state" :value="stateText" />
  </Scenario>
</template>
