<script setup lang="ts">
import { computed } from 'vue';
import { VideoView, useVideoPlayer } from '@symbiote-native/video/vue';
import ActionButton from '../components/ActionButton.vue';
import Scenario from '../components/Scenario.vue';
import { usePlayerEvent } from './video-parts';
import { CLIP_URI } from './video-shared';

defineProps<{ color: string }>();

const player = useVideoPlayer(
  () => CLIP_URI,
  instance => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  },
);
const muted = usePlayerEvent(player, 'mutedChange', { muted: player.value.muted });
const playing = usePlayerEvent(player, 'playingChange', { isPlaying: player.value.playing });
const badge = computed(() => (muted.value.muted ? 'muted' : 'sound on'));
const muteTitle = computed(() => (muted.value.muted ? 'Unmute' : 'Mute'));
const playTitle = computed(() => (playing.value.isPlaying ? 'Pause' : 'Play'));

function toggleMute(): void {
  player.value.muted = !player.value.muted;
}

function togglePlay(): void {
  if (playing.value.isPlaying) {
    player.value.pause();
  } else {
    player.value.play();
  }
}
</script>

<template>
  <Scenario
    testID="video-feed-scenario"
    title="Autoplay a muted looping clip, tap to unmute"
    why="Feeds and product pages start a short clip silently and in a loop, and give sound only after a tap, so nothing blares at a user who is scrolling."
    :steps="['Open the card and watch the clip start by itself', 'Tap Unmute', 'Press Pause']"
    expect="The clip starts without any tap, repeats when it ends and is silent. Unmute turns the sound on, Pause freezes the picture."
  >
    <view>
      <VideoView
        testID="video-feed"
        :player="player"
        :nativeControls="false"
        contentFit="cover"
        class="vid-feed"
      />
      <view class="vid-badge">
        <text class="vid-badge-text">
          {{ badge }}
        </text>
      </view>
    </view>
    <view class="button-row">
      <ActionButton
        testID="video-feed-mute"
        :title="muteTitle"
        :color="color"
        @press="toggleMute"
      />
      <ActionButton
        testID="video-feed-play"
        :title="playTitle"
        :color="color"
        @press="togglePlay"
      />
    </view>
  </Scenario>
</template>
