<script setup lang="ts">
import { computed } from 'vue';
import { useAudioRecorderState } from '@symbiote-native/audio/vue';
import type { AudioRecorder } from '@symbiote-native/audio/vue';
import Card from '../components/Card.vue';
import ResultRow from '../components/ResultRow.vue';

const props = defineProps<{ recorder: AudioRecorder; interval: number }>();

// The parent re-mounts this card for every new recorder or interval, so neither changes here
const stateRef = useAudioRecorderState(props.recorder, props.interval);
const state = computed(() => stateRef.value);
</script>

<template>
  <Card testID="audio-recorder-state-card" title="useAudioRecorderState">
    <ResultRow
      testID="audio-recorder-can"
      label="canRecord, isRecording"
      :value="`${state.canRecord}, ${state.isRecording}`"
    />
    <ResultRow
      testID="audio-recorder-duration"
      label="durationMillis"
      :value="String(state.durationMillis)"
    />
    <ResultRow testID="audio-recorder-metering" label="metering" :value="String(state.metering ?? 'off')" />
    <ResultRow testID="audio-recorder-url" label="url" :value="state.url ?? 'none'" />
    <ResultRow
      testID="audio-recorder-reset"
      label="mediaServicesDidReset"
      :value="String(state.mediaServicesDidReset)"
    />
  </Card>
</template>
