import { defineComponent, ref } from 'vue';
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
  createAudioStream,
  getPreloadedSources,
  getRecordingPermissionsAsync,
  preload,
  requestNotificationPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  useAudioStream,
} from '@symbiote-native/audio/vue';
import type {
  AudioStream,
  IAudioStreamBuffer,
  IAudioStreamEncoding,
  IInterruptionMode,
} from '@symbiote-native/audio/vue';
import { CallConsole } from '../components/CallConsole';
import { Card, ChoiceRow, Field, ResultRow, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { TRACK_URL } from './audio-player';

const color = lineColorOf(ROUTE_NAME.Audio);
const MODES: readonly { label: string; value: IInterruptionMode }[] = [
  { label: 'mixWithOthers', value: 'mixWithOthers' },
  { label: 'doNotMix', value: 'doNotMix' },
  { label: 'duckOthers', value: 'duckOthers' },
];
const ENCODINGS: readonly { label: string; value: IAudioStreamEncoding }[] = [
  { label: 'float32', value: 'float32' },
  { label: 'int16', value: 'int16' },
];

type IMode = {
  playsInSilentMode: boolean;
  interruptionMode: IInterruptionMode;
  allowsRecording: boolean;
  shouldPlayInBackground: boolean;
  shouldRouteThroughEarpiece: boolean;
  allowsBackgroundRecording: boolean;
};

function ModeCard(props: { mode: IMode; setMode: (patch: Partial<IMode>) => void }) {
  return (
    <Card testID="audio-mode-card" title="Audio mode inputs">
      <ToggleRow testID="audio-mode-silent-switch" label="playsInSilentMode" value={props.mode.playsInSilentMode} onChange={playsInSilentMode => props.setMode({ playsInSilentMode })} color={color} />
      <ChoiceRow testID="audio-mode-interruption" label="interruptionMode" options={MODES} value={props.mode.interruptionMode} onChange={interruptionMode => props.setMode({ interruptionMode })} color={color} />
      <ToggleRow testID="audio-mode-recording-switch" label="allowsRecording (iOS)" value={props.mode.allowsRecording} onChange={allowsRecording => props.setMode({ allowsRecording })} color={color} />
      <ToggleRow testID="audio-mode-background-switch" label="shouldPlayInBackground" value={props.mode.shouldPlayInBackground} onChange={shouldPlayInBackground => props.setMode({ shouldPlayInBackground })} color={color} />
      <ToggleRow testID="audio-mode-earpiece-switch" label="shouldRouteThroughEarpiece" value={props.mode.shouldRouteThroughEarpiece} onChange={shouldRouteThroughEarpiece => props.setMode({ shouldRouteThroughEarpiece })} color={color} />
      <ToggleRow testID="audio-mode-background-recording-switch" label="allowsBackgroundRecording" value={props.mode.allowsBackgroundRecording} onChange={allowsBackgroundRecording => props.setMode({ allowsBackgroundRecording })} color={color} />
    </Card>
  );
}

const ModuleCalls = defineComponent(
  () => {
    const mode = ref<IMode>({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      allowsRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
      allowsBackgroundRecording: false,
    });
    const source = ref(TRACK_URL);
    const buffer = ref('10');
    const setMode = (patch: Partial<IMode>) => {
      mode.value = { ...mode.value, ...patch };
    };
    return () => (
      <>
        <ModeCard mode={mode.value} setMode={setMode} />
        <Card testID="audio-preload-card" title="Preload inputs">
          <Field testID="audio-preload-source-input" label="source uri" value={source.value} onChange={next => { source.value = next; }} />
          <Field testID="audio-preload-buffer-input" label="preferredForwardBufferDuration" value={buffer.value} onChange={next => { buffer.value = next; }} />
        </Card>
        <CallConsole
          prefix="audio-module"
          title="Module functions"
          color={color}
          calls={[
            { label: 'setAudioModeAsync', run: () => setAudioModeAsync(mode.value) },
            { label: 'setIsAudioActiveAsync (false)', run: () => setIsAudioActiveAsync(false) },
            { label: 'setIsAudioActiveAsync (true)', run: () => setIsAudioActiveAsync(true) },
            { label: 'getRecordingPermissionsAsync', run: () => getRecordingPermissionsAsync() },
            { label: 'requestRecordingPermissionsAsync', run: () => requestRecordingPermissionsAsync() },
            { label: 'requestNotificationPermissionsAsync', run: () => requestNotificationPermissionsAsync() },
            { label: 'preload', run: () => preload(source.value, { preferredForwardBufferDuration: Number(buffer.value) }) },
            { label: 'getPreloadedSources', run: () => getPreloadedSources() },
            { label: 'clearPreloadedSource', run: () => clearPreloadedSource(source.value) },
            { label: 'clearAllPreloadedSources', run: () => clearAllPreloadedSources() },
            {
              label: 'event name constants',
              run: async () => ({ PLAYBACK_STATUS_UPDATE, AUDIO_SAMPLE_UPDATE, RECORDING_STATUS_UPDATE, PLAYLIST_STATUS_UPDATE, TRACK_CHANGED, AUDIO_STREAM_BUFFER, AUDIO_STREAM_STATUS }),
            },
          ]}
        />
      </>
    );
  },
  { name: 'ModuleCalls' },
);

type IStreamForm = { sampleRate: string; channels: string; encoding: IAudioStreamEncoding };

function StreamInputs(props: { form: IStreamForm; setForm: (patch: Partial<IStreamForm>) => void }) {
  return (
    <Card testID="audio-stream-form-card" title="Stream inputs">
      <Field testID="audio-stream-rate-input" label="sampleRate" value={props.form.sampleRate} onChange={sampleRate => props.setForm({ sampleRate })} />
      <Field testID="audio-stream-channels-input" label="channels" value={props.form.channels} onChange={channels => props.setForm({ channels })} />
      <ChoiceRow testID="audio-stream-encoding" label="encoding" options={ENCODINGS} value={props.form.encoding} onChange={encoding => props.setForm({ encoding })} color={color} />
    </Card>
  );
}

const HookStream = defineComponent<{ form: IStreamForm }>(
  props => {
    const last = ref('no buffer yet');
    const onBuffer = (data: IAudioStreamBuffer) => {
      last.value = `${data.data.byteLength} bytes, ${data.sampleRate} Hz, ${data.channels} ch, t=${data.timestamp.toFixed(2)}`;
    };
    const result = useAudioStream(() => ({
      sampleRate: Number(props.form.sampleRate),
      channels: Number(props.form.channels),
      encoding: props.form.encoding,
      onBuffer,
    }));
    return () => (
      <>
        <CallConsole
          prefix="audio-stream"
          title="useAudioStream (needs the microphone permission)"
          color={color}
          calls={[
            { label: 'start', run: () => result.value.stream.start() },
            { label: 'stop', run: async () => result.value.stream.stop() },
            { label: 'stream properties', run: async () => ({ id: result.value.stream.id, sampleRate: result.value.stream.sampleRate, channels: result.value.stream.channels, isStreaming: result.value.stream.isStreaming }) },
          ]}
        />
        <Card testID="audio-stream-status-card" title="Stream state">
          <ResultRow testID="audio-stream-streaming" label="isStreaming" value={String(result.value.isStreaming)} />
          <ResultRow testID="audio-stream-buffer" label="last buffer (onBuffer)" value={last.value} />
        </Card>
      </>
    );
  },
  { name: 'HookStream', props: ['form'] },
);

const ImperativeStream = defineComponent<{ form: IStreamForm }>(
  props => {
    let stream: AudioStream | null = null;
    const live = () => {
      if (stream === null) {
        throw new Error('createAudioStream first');
      }
      return stream;
    };
    return () => (
      <CallConsole
        prefix="audio-stream-imperative"
        title="createAudioStream (manual lifetime)"
        color={color}
        calls={[
          { label: 'createAudioStream', run: async () => { stream = createAudioStream({ sampleRate: Number(props.form.sampleRate), channels: Number(props.form.channels), encoding: props.form.encoding }); return stream.id; } },
          { label: 'start (imperative)', run: () => live().start() },
          { label: 'stop (imperative)', run: async () => live().stop() },
        ]}
      />
    );
  },
  { name: 'ImperativeStream', props: ['form'] },
);

export const ModuleStreamCards = defineComponent(
  () => {
    const form = ref<IStreamForm>({ sampleRate: '48000', channels: '1', encoding: 'float32' });
    const setForm = (patch: Partial<IStreamForm>) => {
      form.value = { ...form.value, ...patch };
    };
    return () => (
      <>
        <ModuleCalls />
        <StreamInputs form={form.value} setForm={setForm} />
        <HookStream form={form.value} />
        <ImperativeStream form={form.value} />
      </>
    );
  },
  { name: 'ModuleStreamCards' },
);
