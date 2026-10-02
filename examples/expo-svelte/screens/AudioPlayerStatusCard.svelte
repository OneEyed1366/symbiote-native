<script lang="ts">
  import { useAudioPlayerStatus } from '@symbiote-native/audio/svelte';
  import type { AudioPlayer } from '@symbiote-native/audio/svelte';
  import Card from '../components/Card.svelte';
  import ResultRow from '../components/ResultRow.svelte';

  let { player }: { player: AudioPlayer } = $props();

  const status = useAudioPlayerStatus(() => player);
  const current = $derived(status.current);
</script>

<Card testID="audio-player-status-card" title="useAudioPlayerStatus">
  <ResultRow
    testID="audio-player-state"
    label="playbackState"
    value={`${current.playbackState} / ${current.timeControlStatus}`}
  />
  <ResultRow
    testID="audio-player-time"
    label="currentTime / duration"
    value={`${current.currentTime.toFixed(1)} / ${current.duration.toFixed(1)}`}
  />
  <ResultRow
    testID="audio-player-flags"
    label="playing, loaded, buffering, loop, mute"
    value={[current.playing, current.isLoaded, current.isBuffering, current.loop, current.mute].join(', ')}
  />
  <ResultRow
    testID="audio-player-rate"
    label="playbackRate, pitch, live"
    value={`${current.playbackRate}, ${current.shouldCorrectPitch}, ${current.isLive}`}
  />
  <ResultRow
    testID="audio-player-finished"
    label="didJustFinish, error"
    value={`${current.didJustFinish}, ${current.error ?? 'none'}`}
  />
</Card>
