<script lang="ts">
  import { createAudioStream, useAudioStream } from '@symbiote-native/audio/svelte';
  import type {
    AudioStream,
    IAudioStreamBuffer,
    IAudioStreamEncoding,
  } from '@symbiote-native/audio/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.Audio);
  const ENCODINGS: readonly { label: string; value: IAudioStreamEncoding }[] = [
    { label: 'float32', value: 'float32' },
    { label: 'int16', value: 'int16' },
  ];

  type IStreamForm = { sampleRate: string; channels: string; encoding: IAudioStreamEncoding };

  let form = $state<IStreamForm>({ sampleRate: '48000', channels: '1', encoding: 'float32' });
  let last = $state('no buffer yet');
  let imperative: AudioStream | null = null;

  function onBuffer(data: IAudioStreamBuffer): void {
    last = `${data.data.byteLength} bytes, ${data.sampleRate} Hz, ${data.channels} ch, t=${data.timestamp.toFixed(2)}`;
  }

  const result = useAudioStream(() => ({
    sampleRate: Number(form.sampleRate),
    channels: Number(form.channels),
    encoding: form.encoding,
    onBuffer,
  }));

  function live(): AudioStream {
    if (imperative === null) {
      throw new Error('createAudioStream first');
    }
    return imperative;
  }
</script>

<Card testID="audio-stream-form-card" title="Stream inputs">
  <Field
    testID="audio-stream-rate-input"
    label="sampleRate"
    value={form.sampleRate}
    onChange={sampleRate => {
      form.sampleRate = sampleRate;
    }}
  />
  <Field
    testID="audio-stream-channels-input"
    label="channels"
    value={form.channels}
    onChange={channels => {
      form.channels = channels;
    }}
  />
  <ChoiceRow
    testID="audio-stream-encoding"
    label="encoding"
    options={ENCODINGS}
    value={form.encoding}
    onChange={encoding => {
      form.encoding = encoding;
    }}
    {color}
  />
</Card>
<CallConsole
  prefix="audio-stream"
  title="useAudioStream (needs the microphone permission)"
  {color}
  calls={[
    { label: 'start', run: () => result.current.stream.start() },
    { label: 'stop', run: async () => result.current.stream.stop() },
    {
      label: 'stream properties',
      run: async () => ({
        id: result.current.stream.id,
        sampleRate: result.current.stream.sampleRate,
        channels: result.current.stream.channels,
        isStreaming: result.current.stream.isStreaming,
      }),
    },
  ]}
/>
<Card testID="audio-stream-status-card" title="Stream state">
  <ResultRow testID="audio-stream-streaming" label="isStreaming" value={String(result.current.isStreaming)} />
  <ResultRow testID="audio-stream-buffer" label="last buffer (onBuffer)" value={last} />
</Card>
<CallConsole
  prefix="audio-stream-imperative"
  title="createAudioStream (manual lifetime)"
  {color}
  calls={[
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
  ]}
/>
