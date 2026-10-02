<script setup lang="ts">
import { computed } from 'vue';
import { useAudioPlayerStatus } from '@symbiote-native/audio/vue';
import type { AudioPlayer } from '@symbiote-native/audio/vue';
import Card from '../components/Card.vue';
import ResultRow from '../components/ResultRow.vue';

const props = defineProps<{ player: AudioPlayer }>();

const status = useAudioPlayerStatus(() => props.player);
const current = computed(() => status.value);
</script>

<template>
  <Card testID="audio-player-status-card" title="useAudioPlayerStatus">
    <ResultRow
      testID="audio-player-state"
      label="playbackState"
      :value="`${current.playbackState} / ${current.timeControlStatus}`"
    />
    <ResultRow
      testID="audio-player-time"
      label="currentTime / duration"
      :value="`${current.currentTime.toFixed(1)} / ${current.duration.toFixed(1)}`"
    />
    <ResultRow
      testID="audio-player-flags"
      label="playing, loaded, buffering, loop, mute"
      :value="[current.playing, current.isLoaded, current.isBuffering, current.loop, current.mute].join(', ')"
    />
    <ResultRow
      testID="audio-player-rate"
      label="playbackRate, pitch, live"
      :value="`${current.playbackRate}, ${current.shouldCorrectPitch}, ${current.isLive}`"
    />
    <ResultRow
      testID="audio-player-finished"
      label="didJustFinish, error"
      :value="`${current.didJustFinish}, ${current.error ?? 'none'}`"
    />
  </Card>
</template>
