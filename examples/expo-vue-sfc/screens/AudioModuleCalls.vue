<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  AUDIO_SAMPLE_UPDATE,
  AUDIO_STREAM_BUFFER,
  AUDIO_STREAM_STATUS,
  PLAYBACK_STATUS_UPDATE,
  PLAYLIST_STATUS_UPDATE,
  RECORDING_STATUS_UPDATE,
  TRACK_CHANGED,
  clearAllPreloadedSources,
  clearPreloadedSource,
  getPreloadedSources,
  getRecordingPermissionsAsync,
  preload,
  requestNotificationPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  setIsAudioActiveAsync,
} from '@symbiote-native/audio/vue';
import type { IInterruptionMode } from '@symbiote-native/audio/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { TRACK_URL } from './audio-player-calls';

const color = lineColorOf(ROUTE_NAME.Audio);
const MODES: readonly { label: string; value: IInterruptionMode }[] = [
  { label: 'mixWithOthers', value: 'mixWithOthers' },
  { label: 'doNotMix', value: 'doNotMix' },
  { label: 'duckOthers', value: 'duckOthers' },
];

type IMode = {
  playsInSilentMode: boolean;
  interruptionMode: IInterruptionMode;
  allowsRecording: boolean;
  shouldPlayInBackground: boolean;
  shouldRouteThroughEarpiece: boolean;
  allowsBackgroundRecording: boolean;
};

const mode = reactive<IMode>({
  playsInSilentMode: true,
  interruptionMode: MODES[0].value,
  allowsRecording: false,
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
  allowsBackgroundRecording: false,
});
const source = ref(TRACK_URL);
const buffer = ref('10');

const calls = [
  { label: 'setAudioModeAsync', run: () => setAudioModeAsync({ ...mode }) },
  { label: 'setIsAudioActiveAsync (false)', run: () => setIsAudioActiveAsync(false) },
  { label: 'setIsAudioActiveAsync (true)', run: () => setIsAudioActiveAsync(true) },
  { label: 'getRecordingPermissionsAsync', run: () => getRecordingPermissionsAsync() },
  { label: 'requestRecordingPermissionsAsync', run: () => requestRecordingPermissionsAsync() },
  {
    label: 'requestNotificationPermissionsAsync',
    run: () => requestNotificationPermissionsAsync(),
  },
  {
    label: 'preload',
    run: () => preload(source.value, { preferredForwardBufferDuration: Number(buffer.value) }),
  },
  { label: 'getPreloadedSources', run: () => getPreloadedSources() },
  { label: 'clearPreloadedSource', run: () => clearPreloadedSource(source.value) },
  { label: 'clearAllPreloadedSources', run: () => clearAllPreloadedSources() },
  {
    label: 'event name constants',
    run: async () => ({
      PLAYBACK_STATUS_UPDATE,
      AUDIO_SAMPLE_UPDATE,
      RECORDING_STATUS_UPDATE,
      PLAYLIST_STATUS_UPDATE,
      TRACK_CHANGED,
      AUDIO_STREAM_BUFFER,
      AUDIO_STREAM_STATUS,
    }),
  },
];
</script>

<template>
  <Card testID="audio-mode-card" title="Audio mode inputs">
    <ToggleRow
      testID="audio-mode-silent-switch"
      label="playsInSilentMode"
      :value="mode.playsInSilentMode"
      :onChange="playsInSilentMode => (mode.playsInSilentMode = playsInSilentMode)"
      :color="color"
    />
    <ChoiceRow
      testID="audio-mode-interruption"
      label="interruptionMode"
      :options="MODES"
      :value="mode.interruptionMode"
      :onChange="interruptionMode => (mode.interruptionMode = interruptionMode)"
      :color="color"
    />
    <ToggleRow
      testID="audio-mode-recording-switch"
      label="allowsRecording (iOS)"
      :value="mode.allowsRecording"
      :onChange="allowsRecording => (mode.allowsRecording = allowsRecording)"
      :color="color"
    />
    <ToggleRow
      testID="audio-mode-background-switch"
      label="shouldPlayInBackground"
      :value="mode.shouldPlayInBackground"
      :onChange="shouldPlayInBackground => (mode.shouldPlayInBackground = shouldPlayInBackground)"
      :color="color"
    />
    <ToggleRow
      testID="audio-mode-earpiece-switch"
      label="shouldRouteThroughEarpiece"
      :value="mode.shouldRouteThroughEarpiece"
      :onChange="
        shouldRouteThroughEarpiece => (mode.shouldRouteThroughEarpiece = shouldRouteThroughEarpiece)
      "
      :color="color"
    />
    <ToggleRow
      testID="audio-mode-background-recording-switch"
      label="allowsBackgroundRecording"
      :value="mode.allowsBackgroundRecording"
      :onChange="
        allowsBackgroundRecording => (mode.allowsBackgroundRecording = allowsBackgroundRecording)
      "
      :color="color"
    />
  </Card>
  <Card testID="audio-preload-card" title="Preload inputs">
    <Field
      testID="audio-preload-source-input"
      label="source uri"
      :value="source"
      :onChange="next => (source = next)"
    />
    <Field
      testID="audio-preload-buffer-input"
      label="preferredForwardBufferDuration"
      :value="buffer"
      :onChange="next => (buffer = next)"
    />
  </Card>
  <CallConsole prefix="audio-module" title="Module functions" :color="color" :calls="calls" />
</template>
