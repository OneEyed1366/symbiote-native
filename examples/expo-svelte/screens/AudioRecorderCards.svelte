<script lang="ts">
  import {
    RECORDING_STATUS_UPDATE,
    createAudioRecorder,
    useAudioRecorder,
  } from '@symbiote-native/audio/svelte';
  import type { AudioRecorder, IRecordingStatus } from '@symbiote-native/audio/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import AudioRecorderStateCard from './AudioRecorderStateCard.svelte';
  import {
    DIRECTORIES,
    INITIAL_RECORDER_FORM,
    PRESETS,
    QUALITIES,
    optionsOf,
    recorderControls,
  } from './audio-recorder-options';
  import type { IRecorderForm } from './audio-recorder-options';

  const color = lineColorOf(ROUTE_NAME.Audio);

  let form = $state<IRecorderForm>({ ...INITIAL_RECORDER_FORM });
  let statuses = $state('no status yet');
  let imperative: AudioRecorder | null = null;

  const recorder = useAudioRecorder(
    () => optionsOf(form),
    (status: IRecordingStatus) => {
      statuses = `${RECORDING_STATUS_UPDATE}: finished=${status.isFinished} error=${status.error ?? 'none'} url=${status.url ?? 'none'}`;
    },
  );

  function live(): AudioRecorder {
    if (imperative === null) {
      throw new Error('createAudioRecorder first');
    }
    return imperative;
  }
</script>

<Card testID="audio-recorder-form-card" title="Recorder inputs">
  <ChoiceRow
    testID="audio-recorder-preset"
    label="RecordingPresets"
    options={PRESETS}
    value={form.preset}
    onChange={preset => {
      form.preset = preset;
    }}
    {color}
  />
  <ChoiceRow
    testID="audio-recorder-directory"
    label="directory"
    options={DIRECTORIES}
    value={form.directory}
    onChange={directory => {
      form.directory = directory;
    }}
    {color}
  />
  <ToggleRow
    testID="audio-recorder-metering-switch"
    label="isMeteringEnabled"
    value={form.isMetering}
    onChange={isMetering => {
      form.isMetering = isMetering;
    }}
    {color}
  />
  <Field
    testID="audio-recorder-rate-input"
    label="sampleRate (custom)"
    value={form.sampleRate}
    onChange={sampleRate => {
      form.sampleRate = sampleRate;
    }}
  />
  <Field
    testID="audio-recorder-bitrate-input"
    label="bitRate (custom)"
    value={form.bitRate}
    onChange={bitRate => {
      form.bitRate = bitRate;
    }}
  />
  <Field
    testID="audio-recorder-channels-input"
    label="numberOfChannels (custom)"
    value={form.channels}
    onChange={channels => {
      form.channels = channels;
    }}
  />
  <ChoiceRow
    testID="audio-recorder-quality"
    label="AudioQuality (iOS, custom)"
    options={QUALITIES}
    value={form.quality}
    onChange={quality => {
      form.quality = quality;
    }}
    {color}
  />
  <Field
    testID="audio-recorder-duration-input"
    label="forDuration seconds"
    value={form.seconds}
    onChange={seconds => {
      form.seconds = seconds;
    }}
  />
  <Field
    testID="audio-recorder-at-input"
    label="atTime seconds (iOS)"
    value={form.atTime}
    onChange={atTime => {
      form.atTime = atTime;
    }}
  />
  <Field
    testID="audio-recorder-poll-input"
    label="useAudioRecorderState interval ms"
    value={form.pollInterval}
    onChange={pollInterval => {
      form.pollInterval = pollInterval;
    }}
  />
  <Field
    testID="audio-recorder-input-uid"
    label="input uid for setInput"
    value={form.inputUid}
    onChange={inputUid => {
      form.inputUid = inputUid;
    }}
  />
</Card>
<CallConsole
  prefix="audio-recorder"
  title="useAudioRecorder controls"
  {color}
  hint="Needs the microphone permission from the Module card."
  calls={recorderControls(recorder.current, form)}
/>
<text testID="audio-recorder-status" class="info-text">{statuses}</text>
{#key `${String(recorder.current.id)}:${form.pollInterval}`}
  <AudioRecorderStateCard recorder={recorder.current} interval={Number(form.pollInterval)} />
{/key}
<CallConsole
  prefix="audio-recorder-imperative"
  title="createAudioRecorder (manual lifetime)"
  {color}
  calls={[
    {
      label: 'createAudioRecorder',
      run: async () => {
        imperative = createAudioRecorder(optionsOf(form));
        return imperative.id;
      },
    },
    { label: 'prepare (imperative)', run: async () => live().prepareToRecordAsync() },
    { label: 'record (imperative)', run: async () => live().record() },
    {
      label: 'stop (imperative)',
      run: async () => {
        await live().stop();
        return live().uri;
      },
    },
  ]}
/>
