<script lang="ts">
  import { VideoView, useVideoPlayer } from '@symbiote-native/video/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import PlayerStatusRows from './PlayerStatusRows.svelte';
  import { usePlayerEvent, usePlayerEventOrNull } from './video-parts';
  import { HLS_URI, MP4_URI, TIME_UPDATE_SECONDS, errorLine, trackLabel, trackSummary } from './video-shared';

  const { color }: { color: string } = $props();

  const player = useVideoPlayer(
    () => HLS_URI,
    instance => {
      instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
    },
  );
  const load = usePlayerEventOrNull(player, 'sourceLoad');
  const subtitle = usePlayerEvent(player, 'subtitleTrackChange', { subtitleTrack: player.current.subtitleTrack });
  const audio = usePlayerEvent(player, 'audioTrackChange', { audioTrack: player.current.audioTrack });
  const video = usePlayerEvent(player, 'videoTrackChange', { videoTrack: player.current.videoTrack });
  let source = $state('adaptive stream');

  const subtitles = $derived(load.current?.availableSubtitleTracks ?? []);
  const audios = $derived(load.current?.availableAudioTracks ?? []);
  const track = $derived(video.current.videoTrack);
  const summary = $derived(
    load.current === null
      ? 'not loaded'
      : trackSummary(load.current.duration, load.current.availableVideoTracks.length, audios.length, subtitles.length),
  );

  async function switchTo(name: string, uri: string): Promise<void> {
    source = `loading ${name}…`;
    try {
      await player.current.replaceAsync(uri);
      source = name;
    } catch (error) {
      source = `failed: ${errorLine(error)}`;
    }
  }
</script>

<Scenario
  testID="video-tracks-scenario"
  title="Pick a subtitle, a language and see the quality"
  why="Streams ship several audio languages, subtitles and bitrates. An app lists them from the player and lets the user choose, or swaps the whole source for the next episode."
  steps={['Press play on the native controls', 'Press a subtitle button, then an audio button', 'Press Switch to the MP4 and back']}
  expect="The lists show what the stream offers. Choosing a subtitle shows its text on the picture and updates the line below, and the quality line shows the current resolution."
>
  <VideoView testID="video-tracks" player={player.current} nativeControls class="vid-video" />
  <PlayerStatusRows {player} prefix="video-tracks" />
  <ResultRow testID="video-tracks-source" label="Source" value={source} />
  <ResultRow testID="video-tracks-duration" label="sourceLoad" value={summary} />
  <ResultRow testID="video-tracks-quality" label="videoTrack" value={track === null ? 'unknown' : `${track.size.width}x${track.size.height}`} />
  <ResultRow testID="video-tracks-subtitle" label="subtitleTrack" value={trackLabel(subtitle.current.subtitleTrack)} />
  <ResultRow testID="video-tracks-audio" label="audioTrack" value={trackLabel(audio.current.audioTrack)} />
  <view class="button-row">
    <ActionButton testID="video-subtitle-off" title="Subtitles off" {color} onPress={() => (player.current.subtitleTrack = null)} />
    {#each subtitles as item (item.id ?? item.label)}
      <ActionButton testID={`video-subtitle-${item.language}`} title={item.label} {color} onPress={() => (player.current.subtitleTrack = item)} />
    {/each}
  </view>
  <view class="button-row">
    {#each audios as item (item.id ?? item.label)}
      <ActionButton testID={`video-audio-${item.language}`} title={item.label} {color} onPress={() => (player.current.audioTrack = item)} />
    {/each}
  </view>
  <view class="button-row">
    <ActionButton testID="video-switch-mp4" title="Switch to the MP4" {color} onPress={() => switchTo('MP4', MP4_URI)} />
    <ActionButton testID="video-switch-hls" title="Switch back to the stream" {color} onPress={() => switchTo('adaptive stream', HLS_URI)} />
  </view>
</Scenario>
