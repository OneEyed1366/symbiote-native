<script lang="ts">
  import {
    PLAYLIST_STATUS_UPDATE,
    TRACK_CHANGED,
    useAudioPlaylistStatus,
  } from '@symbiote-native/audio/svelte';
  import type { AudioPlaylist } from '@symbiote-native/audio/svelte';
  import Card from '../components/Card.svelte';
  import ResultRow from '../components/ResultRow.svelte';

  let { playlist }: { playlist: AudioPlaylist } = $props();

  const status = useAudioPlaylistStatus(() => playlist);
  const current = $derived(status.current);
  let lastChange = $state('no track change yet');

  $effect(() => {
    const subscription = playlist.addListener(TRACK_CHANGED, data => {
      lastChange = `${data.previousIndex} -> ${data.currentIndex}`;
    });
    return () => subscription.remove();
  });
</script>

<Card testID="audio-playlist-status-card" title={`useAudioPlaylistStatus (${PLAYLIST_STATUS_UPDATE})`}>
  <ResultRow
    testID="audio-playlist-track"
    label="currentIndex / trackCount"
    value={`${current.currentIndex} / ${current.trackCount}`}
  />
  <ResultRow
    testID="audio-playlist-time"
    label="currentTime / duration"
    value={`${current.currentTime.toFixed(1)} / ${current.duration.toFixed(1)}`}
  />
  <ResultRow
    testID="audio-playlist-flags"
    label="playing, loaded, buffering"
    value={`${current.playing}, ${current.isLoaded}, ${current.isBuffering}`}
  />
  <ResultRow
    testID="audio-playlist-mix"
    label="volume, rate, muted, loop"
    value={`${current.volume}, ${current.playbackRate}, ${current.muted}, ${current.loop}`}
  />
  <ResultRow testID="audio-playlist-finished" label="didJustFinish" value={String(current.didJustFinish)} />
  <ResultRow testID="audio-playlist-change" label={TRACK_CHANGED} value={lastChange} />
</Card>
