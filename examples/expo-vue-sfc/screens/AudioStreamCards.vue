<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { createAudioStream, useAudioStream } from '@symbiote-native/audio/vue';
import type {
  AudioStream,
  IAudioStreamBuffer,
  IAudioStreamEncoding,
} from '@symbiote-native/audio/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import ResultRow from '../components/ResultRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Audio);
const ENCODINGS: readonly { label: string; value: IAudioStreamEncoding }[] = [
  { label: 'float32', value: 'float32' },
  { label: 'int16', value: 'int16' },
];

type IStreamForm = { sampleRate: string; channels: string; encoding: IAudioStreamEncoding };

const form = reactive<IStreamForm>({ sampleRate: '48000', channels: '1', encoding: 'float32' });
const last = ref('no buffer yet');
let imperative: AudioStream | null = null;

function onBuffer(data: IAudioStreamBuffer): void {
  last.value = `${data.data.byteLength} bytes, ${data.sampleRate} Hz, ${data.channels} ch, t=${data.timestamp.toFixed(2)}`;
}

const resultRef = useAudioStream(() => ({
  sampleRate: Number(form.sampleRate),
  channels: Number(form.channels),
  encoding: form.encoding,
  onBuffer,
}));
const result = computed(() => resultRef.value);

function live(): AudioStream {
  if (imperative === null) {
    throw new Error('createAudioStream first');
  }
  return imperative;
}

const hookCalls = [
  { label: 'start', run: () => resultRef.value.stream.start() },
  { label: 'stop', run: async () => resultRef.value.stream.stop() },
  {
    label: 'stream properties',
    run: async () => ({
      id: resultRef.value.stream.id,
      sampleRate: resultRef.value.stream.sampleRate,
      channels: resultRef.value.stream.channels,
      isStreaming: resultRef.value.stream.isStreaming,
    }),
  },
];

const imperativeCalls = [
  {
    label: 'createAudioStream',
    run: async () => {
      imperative = createAudioStream({
        sampleRate: Number(form.sampleRate),
        channels: Number(form.channels),
        encoding: form.encoding,
      });
      return imperative.id;
    },
  },
  { label: 'start (imperative)', run: () => live().start() },
  { label: 'stop (imperative)', run: async () => live().stop() },
];
</script>

<template>
  <Card testID="audio-stream-form-card" title="Stream inputs">
    <Field
      testID="audio-stream-rate-input"
      label="sampleRate"
      :value="form.sampleRate"
      :onChange="sampleRate => (form.sampleRate = sampleRate)"
    />
    <Field
      testID="audio-stream-channels-input"
      label="channels"
      :value="form.channels"
      :onChange="channels => (form.channels = channels)"
    />
    <ChoiceRow
      testID="audio-stream-encoding"
      label="encoding"
      :options="ENCODINGS"
      :value="form.encoding"
      :onChange="encoding => (form.encoding = encoding)"
      :color="color"
    />
  </Card>
  <CallConsole
    prefix="audio-stream"
    title="useAudioStream (needs the microphone permission)"
    :color="color"
    :calls="hookCalls"
  />
  <Card testID="audio-stream-status-card" title="Stream state">
    <ResultRow
      testID="audio-stream-streaming"
      label="isStreaming"
      :value="String(result.isStreaming)"
    />
    <ResultRow testID="audio-stream-buffer" label="last buffer (onBuffer)" :value="last" />
  </Card>
  <CallConsole
    prefix="audio-stream-imperative"
    title="createAudioStream (manual lifetime)"
    :color="color"
    :calls="imperativeCalls"
  />
</template>
