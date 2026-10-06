<script setup lang="ts">
import { computed } from 'vue';
import type { VideoPlayer } from '@symbiote-native/video/vue';
import ResultRow from '../components/ResultRow.vue';
import { usePlayerEvent } from './video-parts';
import { statusLine, timeLine } from './video-shared';

// Live values of the player through the `useEvent` composable of the adapter
// A template hands the player over already unwrapped, so it is read through a getter
const props = defineProps<{ player: VideoPlayer; prefix: string }>();
const getPlayer = (): VideoPlayer => props.player;

const status = usePlayerEvent(getPlayer, 'statusChange', { status: props.player.status });
const playing = usePlayerEvent(getPlayer, 'playingChange', { isPlaying: props.player.playing });
const time = usePlayerEvent(getPlayer, 'timeUpdate', {
  currentTime: props.player.currentTime,
  currentLiveTimestamp: null,
  currentOffsetFromLive: null,
  bufferedPosition: props.player.bufferedPosition,
});

const statusText = computed(() => statusLine(status.value.status, status.value.error?.message));
const playingText = computed(() => String(playing.value.isPlaying));
const timeText = computed(() => timeLine(time.value.currentTime, props.player.duration, time.value.bufferedPosition));
</script>

<template>
  <ResultRow
    :testID="`${prefix}-status`"
    label="statusChange"
    :value="statusText"
  />
  <ResultRow
    :testID="`${prefix}-playing`"
    label="playingChange"
    :value="playingText"
  />
  <ResultRow
    :testID="`${prefix}-time`"
    label="timeUpdate"
    :value="timeText"
  />
</template>
