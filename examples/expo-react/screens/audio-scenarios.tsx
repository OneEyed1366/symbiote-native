import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from '@symbiote-native/audio/react';
import { CallConsole } from '../components/CallConsole';
import { Scenario } from '../components/Scenario';
import { ResultRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { TRACK_URL } from './audio-player';

const color = lineColorOf(ROUTE_NAME.Audio);
const SEEK_STEP_SECONDS = 10;

function PlaybackScenario() {
  const player = useAudioPlayer(TRACK_URL);
  const status = useAudioPlayerStatus(player);
  return (
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
          { label: 'Play', run: async () => player.play() },
          { label: 'Pause', run: async () => player.pause() },
          { label: 'Skip forward 10 s', run: () => player.seekTo(player.currentTime + SEEK_STEP_SECONDS) },
        ]}
      />
      <ResultRow testID="audio-playback-time" label="time" value={`${status.currentTime.toFixed(1)} / ${status.duration.toFixed(1)} s`} />
      <ResultRow testID="audio-playback-state" label="state" value={status.playing ? 'playing' : status.isBuffering ? 'buffering' : 'paused'} />
    </Scenario>
  );
}

function RecordingScenario() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  return (
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
              await recorder.prepareToRecordAsync();
              recorder.record();
              return 'recording';
            },
          },
          { label: 'Stop', run: async () => { await recorder.stop(); return recorder.uri; } },
        ]}
      />
      <ResultRow testID="audio-recording-state" label="recording" value={String(state.isRecording)} />
      <ResultRow testID="audio-recording-duration" label="duration" value={`${Math.round(state.durationMillis / 1_000)} s`} />
      <ResultRow testID="audio-recording-url" label="url" value={state.url ?? 'none'} />
    </Scenario>
  );
}

export function AudioScenarios() {
  return (
    <>
      <PlaybackScenario />
      <RecordingScenario />
    </>
  );
}
