<script lang="ts">
  import { VideoView, useVideoPlayer } from '@symbiote-native/video/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import PlayerStatusRows from './PlayerStatusRows.svelte';
  import { usePlayerEvent } from './video-parts';
  import { MP4_URI, RATES, SEEK_SECONDS, TIME_UPDATE_SECONDS } from './video-shared';

  const { color }: { color: string } = $props();

  const player = useVideoPlayer(
    () => MP4_URI,
    instance => {
      instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
      instance.volume = 0.8;
    },
  );
  const playing = usePlayerEvent(player, 'playingChange', { isPlaying: player.current.playing });
  const rate = usePlayerEvent(player, 'playbackRateChange', { playbackRate: player.current.playbackRate });
  const muted = usePlayerEvent(player, 'mutedChange', { muted: player.current.muted });
  let isLooping = $state(false);

  function togglePlay(): void {
    if (playing.current.isPlaying) {
      player.current.pause();
    } else {
      player.current.play();
    }
  }
</script>

<Scenario
  testID="video-custom-scenario"
  title="Build your own player controls"
  why="Branded players, lesson apps and short-video feeds hide the system bar and draw their own buttons over the video, driven by the player object."
  steps={['Press Play, then Seek +10 s and Seek -10 s', 'Change the speed to 2x', 'Press Mute, then Replay']}
  expect="The picture jumps 10 seconds each way, plays twice as fast at 2x, goes silent when muted, and Replay starts again from 0:00."
>
  <VideoView testID="video-custom" player={player.current} nativeControls={false} contentFit="cover" class="vid-video" />
  <PlayerStatusRows {player} prefix="video-custom" />
  <view class="button-row">
    <ActionButton testID="video-custom-play" title={playing.current.isPlaying ? 'Pause' : 'Play'} {color} onPress={togglePlay} />
    <ActionButton testID="video-custom-back" title={`-${SEEK_SECONDS} s`} {color} onPress={() => player.current.seekBy(-SEEK_SECONDS)} />
    <ActionButton testID="video-custom-forward" title={`+${SEEK_SECONDS} s`} {color} onPress={() => player.current.seekBy(SEEK_SECONDS)} />
    <ActionButton testID="video-custom-replay" title="Replay" {color} onPress={() => player.current.replay()} />
  </view>
  <ChoiceRow testID="video-custom-rate" label="playbackRate" {color} value={rate.current.playbackRate} options={RATES} onChange={value => (player.current.playbackRate = value)} />
  <ToggleRow testID="video-custom-muted" label="muted" value={muted.current.muted} onChange={value => (player.current.muted = value)} {color} />
  <ToggleRow
    testID="video-custom-loop"
    label="loop"
    value={isLooping}
    onChange={value => {
      player.current.loop = value;
      isLooping = value;
    }}
    {color}
  />
</Scenario>
