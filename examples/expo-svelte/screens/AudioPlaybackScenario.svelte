<script lang="ts">
  import { useAudioPlayer, useAudioPlayerStatus } from '@symbiote-native/audio/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { TRACK_URL } from './audio-player-calls';

  const color = lineColorOf(ROUTE_NAME.Audio);
  const SEEK_STEP_SECONDS = 10;

  const player = useAudioPlayer(() => TRACK_URL);
  const status = useAudioPlayerStatus(() => player.current);

  const stateText = $derived.by((): string => {
    if (status.current.playing) {
      return 'playing';
    }
    return status.current.isBuffering ? 'buffering' : 'paused';
  });
</script>

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
    {color}
    calls={[
      { label: 'Play', run: async () => player.current.play() },
      { label: 'Pause', run: async () => player.current.pause() },
      {
        label: 'Skip forward 10 s',
        run: () => player.current.seekTo(player.current.currentTime + SEEK_STEP_SECONDS),
      },
    ]}
  />
  <ResultRow
    testID="audio-playback-time"
    label="time"
    value={`${status.current.currentTime.toFixed(1)} / ${status.current.duration.toFixed(1)} s`}
  />
  <ResultRow testID="audio-playback-state" label="state" value={stateText} />
</Scenario>
