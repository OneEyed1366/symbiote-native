<script lang="ts">
  import {
    RecordingPresets,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
    useAudioRecorder,
  } from '@symbiote-native/audio/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import AudioRecordingRows from './AudioRecordingRows.svelte';

  const color = lineColorOf(ROUTE_NAME.Audio);

  const recorder = useAudioRecorder(() => RecordingPresets.HIGH_QUALITY);
</script>

<Scenario
  testID="audio-recording-scenario"
  title="Record a voice note"
  why="Capture a voice message or a memo to a file. The recorder needs the microphone permission and gives back a file URI you can play or upload."
  steps={['Press Allow microphone and accept', 'Press Start recording and speak', 'Press Stop']}
  expect="While recording, the duration row counts up. After Stop the url row shows the recorded file, which you can play with the player above."
>
  <CallConsole
    isBare
    prefix="audio-recording"
    title="Recorder"
    {color}
    calls={[
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
          await recorder.current.prepareToRecordAsync();
          recorder.current.record();
          return 'recording';
        },
      },
      {
        label: 'Stop',
        run: async () => {
          await recorder.current.stop();
          return recorder.current.uri;
        },
      },
    ]}
  />
  {#key recorder.current}
    <AudioRecordingRows recorder={recorder.current} />
  {/key}
</Scenario>
