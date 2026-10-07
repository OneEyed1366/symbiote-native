<script lang="ts">
  import type { IUseVideoPlayerResult } from '@symbiote-native/video/svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import { usePlayerEvent } from './video-parts';
  import { statusLine, timeLine } from './video-shared';

  // Live values of the player through the `useEvent` rune of the adapter
  const { player, prefix }: { player: IUseVideoPlayerResult; prefix: string } = $props();

  const status = usePlayerEvent(player, 'statusChange', { status: player.current.status });
  const playing = usePlayerEvent(player, 'playingChange', { isPlaying: player.current.playing });
  const time = usePlayerEvent(player, 'timeUpdate', {
    currentTime: player.current.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: player.current.bufferedPosition,
  });
</script>

<ResultRow testID={`${prefix}-status`} label="statusChange" value={statusLine(status.current.status, status.current.error?.message)} />
<ResultRow testID={`${prefix}-playing`} label="playingChange" value={String(playing.current.isPlaying)} />
<ResultRow
  testID={`${prefix}-time`}
  label="timeUpdate"
  value={timeLine(time.current.currentTime, player.current.duration, time.current.bufferedPosition)}
/>
