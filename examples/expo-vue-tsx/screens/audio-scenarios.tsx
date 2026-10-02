import { defineComponent } from 'vue';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from '@symbiote-native/audio/vue';
import type { AudioRecorder } from '@symbiote-native/audio/vue';
import { CallConsole } from '../components/CallConsole';
import { Scenario } from '../components/Scenario';
import { ResultRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { TRACK_URL } from './audio-player';

const color = lineColorOf(ROUTE_NAME.Audio);
const SEEK_STEP_SECONDS = 10;

const PlaybackScenario = defineComponent(
  () => {
    const player = useAudioPlayer(() => TRACK_URL);
    const status = useAudioPlayerStatus(() => player.value);
    return () => (
      <Scenario
        testID="audio-playback-scenario"
        title="Play a song or a podcast episode"
        why="Stream a remote track with play, pause and seeking, and follow its progress. Keep playing with the screen locked after enabling background mode in the explorer."
        steps={['Press Play', 'Press Skip forward 10 s', 'Press Pause']}
        expect="Audio plays, and the time row moves while it plays. Skipping jumps ten seconds and Pause freezes the time."
      >
        <CallConsole
          isBare
          prefix="audio-playback"
          title="Player"
          color={color}
          calls={[
            { label: 'Play', run: async () => player.value.play() },
            { label: 'Pause', run: async () => player.value.pause() },
            { label: 'Skip forward 10 s', run: () => player.value.seekTo(player.value.currentTime + SEEK_STEP_SECONDS) },
          ]}
        />
        <ResultRow testID="audio-playback-time" label="time" value={`${status.value.currentTime.toFixed(1)} / ${status.value.duration.toFixed(1)} s`} />
        <ResultRow testID="audio-playback-state" label="state" value={status.value.playing ? 'playing' : status.value.isBuffering ? 'buffering' : 'paused'} />
      </Scenario>
    );
  },
  { name: 'PlaybackScenario' },
);

const RecordingRows = defineComponent<{ recorder: AudioRecorder }>(
  props => {
    const state = useAudioRecorderState(props.recorder);
    return () => (
      <>
        <ResultRow testID="audio-recording-state" label="recording" value={String(state.value.isRecording)} />
        <ResultRow testID="audio-recording-duration" label="duration" value={`${Math.round(state.value.durationMillis / 1_000)} s`} />
        <ResultRow testID="audio-recording-url" label="url" value={state.value.url ?? 'none'} />
      </>
    );
  },
  { name: 'RecordingRows', props: ['recorder'] },
);

const RecordingScenario = defineComponent(
  () => {
    const recorder = useAudioRecorder(() => RecordingPresets.HIGH_QUALITY);
    return () => (
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
          color={color}
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
                await recorder.value.prepareToRecordAsync();
                recorder.value.record();
                return 'recording';
              },
            },
            { label: 'Stop', run: async () => { await recorder.value.stop(); return recorder.value.uri; } },
          ]}
        />
        <RecordingRows key={recorder.value.id} recorder={recorder.value} />
      </Scenario>
    );
  },
  { name: 'RecordingScenario' },
);

export function AudioScenarios() {
  return (
    <>
      <PlaybackScenario />
      <RecordingScenario />
    </>
  );
}
