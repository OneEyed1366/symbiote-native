<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  PLAYLIST_STATUS_UPDATE,
  TRACK_CHANGED,
  useAudioPlaylistStatus,
} from '@symbiote-native/audio/vue';
import type { AudioPlaylist } from '@symbiote-native/audio/vue';
import Card from '../components/Card.vue';
import ResultRow from '../components/ResultRow.vue';

const props = defineProps<{ playlist: AudioPlaylist }>();

const status = useAudioPlaylistStatus(() => props.playlist);
const current = computed(() => status.value);
const lastChange = ref('no track change yet');

let subscription: ReturnType<AudioPlaylist['addListener']> | null = null;

onMounted(() => {
  subscription = props.playlist.addListener(TRACK_CHANGED, data => {
    lastChange.value = `${data.previousIndex} -> ${data.currentIndex}`;
  });
});

onUnmounted(() => {
  subscription?.remove();
  subscription = null;
});
</script>

<template>
  <Card testID="audio-playlist-status-card" :title="`useAudioPlaylistStatus (${PLAYLIST_STATUS_UPDATE})`">
    <ResultRow
      testID="audio-playlist-track"
      label="currentIndex / trackCount"
      :value="`${current.currentIndex} / ${current.trackCount}`"
    />
    <ResultRow
      testID="audio-playlist-time"
      label="currentTime / duration"
      :value="`${current.currentTime.toFixed(1)} / ${current.duration.toFixed(1)}`"
    />
    <ResultRow
      testID="audio-playlist-flags"
      label="playing, loaded, buffering"
      :value="`${current.playing}, ${current.isLoaded}, ${current.isBuffering}`"
    />
    <ResultRow
      testID="audio-playlist-mix"
      label="volume, rate, muted, loop"
      :value="`${current.volume}, ${current.playbackRate}, ${current.muted}, ${current.loop}`"
    />
    <ResultRow
      testID="audio-playlist-finished"
      label="didJustFinish"
      :value="String(current.didJustFinish)"
    />
    <ResultRow testID="audio-playlist-change" :label="TRACK_CHANGED" :value="lastChange" />
  </Card>
</template>
