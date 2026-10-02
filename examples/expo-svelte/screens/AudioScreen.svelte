<script lang="ts">
  import Explorer from '../components/Explorer.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import AudioModuleCalls from './AudioModuleCalls.svelte';
  import AudioPlaybackScenario from './AudioPlaybackScenario.svelte';
  import AudioPlayerCards from './AudioPlayerCards.svelte';
  import AudioPlaylistCards from './AudioPlaylistCards.svelte';
  import AudioRecorderCards from './AudioRecorderCards.svelte';
  import AudioRecordingScenario from './AudioRecordingScenario.svelte';
  import AudioStreamCards from './AudioStreamCards.svelte';

  const ROUTE = ROUTE_NAME.Audio;
</script>

<ScreenShell
  route={ROUTE}
  testID="audio-scroll"
  title="Audio"
  body="Play music and podcasts, queue playlists, record voice notes and stream the microphone. Audio session modes, permissions and preloading are in the explorer."
>
  <AudioPlaybackScenario />
  <AudioRecordingScenario />
  <Explorer testID="audio-explorer" color={lineColorOf(ROUTE)}>
    <AudioModuleCalls />
    <AudioStreamCards />
    <AudioPlayerCards />
    <AudioRecorderCards />
    <AudioPlaylistCards />
  </Explorer>
</ScreenShell>
