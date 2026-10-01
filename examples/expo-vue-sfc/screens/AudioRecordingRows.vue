<script setup lang="ts">
import { computed } from 'vue';
import { useAudioRecorderState } from '@symbiote-native/audio/vue';
import type { AudioRecorder } from '@symbiote-native/audio/vue';
import ResultRow from '../components/ResultRow.vue';

const props = defineProps<{ recorder: AudioRecorder }>();

// The parent re-mounts these rows for every new recorder, so the recorder never changes here
const stateRef = useAudioRecorderState(props.recorder);
const state = computed(() => stateRef.value);
</script>

<template>
  <ResultRow testID="audio-recording-state" label="recording" :value="String(state.isRecording)" />
  <ResultRow
    testID="audio-recording-duration"
    label="duration"
    :value="`${Math.round(state.durationMillis / 1_000)} s`"
  />
  <ResultRow testID="audio-recording-url" label="url" :value="state.url ?? 'none'" />
</template>
