<script lang="ts">
  import { VideoView, useVideoPlayer } from '@symbiote-native/video/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { usePlayerEvent } from './video-parts';
  import { CLIP_URI } from './video-shared';

  const { color }: { color: string } = $props();

  const player = useVideoPlayer(
    () => CLIP_URI,
    instance => {
      instance.loop = true;
      instance.muted = true;
      instance.play();
    },
  );
  const muted = usePlayerEvent(player, 'mutedChange', { muted: player.current.muted });
  const playing = usePlayerEvent(player, 'playingChange', { isPlaying: player.current.playing });

  function togglePlay(): void {
    if (playing.current.isPlaying) {
      player.current.pause();
    } else {
      player.current.play();
    }
  }
</script>

<Scenario
  testID="video-feed-scenario"
  title="Autoplay a muted looping clip, tap to unmute"
  why="Feeds and product pages start a short clip silently and in a loop, and give sound only after a tap, so nothing blares at a user who is scrolling."
  steps={['Open the card and watch the clip start by itself', 'Tap Unmute', 'Press Pause']}
  expect="The clip starts without any tap, repeats when it ends and is silent. Unmute turns the sound on, Pause freezes the picture."
>
  <view>
    <VideoView testID="video-feed" player={player.current} nativeControls={false} contentFit="cover" class="vid-feed" />
    <view class="vid-badge">
      <text class="vid-badge-text">{muted.current.muted ? 'muted' : 'sound on'}</text>
    </view>
  </view>
  <view class="button-row">
    <ActionButton testID="video-feed-mute" title={muted.current.muted ? 'Unmute' : 'Mute'} {color} onPress={() => (player.current.muted = !player.current.muted)} />
    <ActionButton testID="video-feed-play" title={playing.current.isPlaying ? 'Pause' : 'Play'} {color} onPress={togglePlay} />
  </view>
</Scenario>
