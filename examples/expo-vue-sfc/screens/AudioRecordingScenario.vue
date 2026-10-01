<script setup lang="ts">
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from '@symbiote-native/audio/vue';
import CallConsole from '../components/CallConsole.vue';
import Scenario from '../components/Scenario.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import AudioRecordingRows from './AudioRecordingRows.vue';

const color = lineColorOf(ROUTE_NAME.Audio);

const recorder = useAudioRecorder(() => RecordingPresets.HIGH_QUALITY);

const calls = [
  {
    label: 'Allow microphone',
    run: async () => {
      const permission = await requestRecordingPermissionsAsync();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      return permission;
    },
  },
  {
    label: 'Start recording',
    run: async () => {
      await recorder.value.prepareToRecordAsync();
      recorder.value.record();
      return 'recording';
    },
  },
  {
    label: 'Stop',
    run: async () => {
      await recorder.value.stop();
      return recorder.value.uri;
    },
  },
];
</script>

<template>
  <Scenario
    testID="audio-recording-scenario"
    title="Record a voice note"
    why="Capture a voice message or a memo to a file. The recorder needs the microphone permission and gives back a file URI you can play or upload."
    :steps="['Press Allow microphone and accept', 'Press Start recording and speak', 'Press Stop']"
    expect="While recording, the duration row counts up. After Stop the url row shows the recorded file, which you can play with the player above."
  >
    <CallConsole isBare prefix="audio-recording" title="Recorder" :color="color" :calls="calls" />
    <AudioRecordingRows :key="recorder.id" :recorder="recorder" />
  </Scenario>
</template>
