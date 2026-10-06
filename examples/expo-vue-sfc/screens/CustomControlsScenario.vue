<script setup lang="ts">
import { computed, ref } from 'vue';
import { VideoView, useVideoPlayer } from '@symbiote-native/video/vue';
import ActionButton from '../components/ActionButton.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Scenario from '../components/Scenario.vue';
import ToggleRow from '../components/ToggleRow.vue';
import PlayerStatusRows from './PlayerStatusRows.vue';
import { usePlayerEvent } from './video-parts';
import { MP4_URI, RATES, SEEK_SECONDS, TIME_UPDATE_SECONDS } from './video-shared';

defineProps<{ color: string }>();

const BACK_TITLE = `-${SEEK_SECONDS} s`;
const FORWARD_TITLE = `+${SEEK_SECONDS} s`;

const player = useVideoPlayer(
  () => MP4_URI,
  instance => {
    instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
    instance.volume = 0.8;
  },
);
const playing = usePlayerEvent(player, 'playingChange', { isPlaying: player.value.playing });
const rate = usePlayerEvent(player, 'playbackRateChange', { playbackRate: player.value.playbackRate });
const muted = usePlayerEvent(player, 'mutedChange', { muted: player.value.muted });
const isLooping = ref(false);
const playTitle = computed(() => (playing.value.isPlaying ? 'Pause' : 'Play'));

function togglePlay(): void {
  if (playing.value.isPlaying) {
    player.value.pause();
  } else {
    player.value.play();
  }
}

function setLoop(value: boolean): void {
  player.value.loop = value;
  isLooping.value = value;
}
</script>

<template>
  <Scenario
    testID="video-custom-scenario"
    title="Build your own player controls"
    why="Branded players, lesson apps and short-video feeds hide the system bar and draw their own buttons over the video, driven by the player object."
    :steps="['Press Play, then Seek +10 s and Seek -10 s', 'Change the speed to 2x', 'Press Mute, then Replay']"
    expect="The picture jumps 10 seconds each way, plays twice as fast at 2x, goes silent when muted, and Replay starts again from 0:00."
  >
    <VideoView
      testID="video-custom"
      :player="player"
      :nativeControls="false"
      contentFit="cover"
      class="vid-video"
    />
    <PlayerStatusRows
      :player="player"
      prefix="video-custom"
    />
    <view class="button-row">
      <ActionButton
        testID="video-custom-play"
        :title="playTitle"
        :color="color"
        @press="togglePlay"
      />
      <ActionButton
        testID="video-custom-back"
        :title="BACK_TITLE"
        :color="color"
        @press="player.seekBy(-SEEK_SECONDS)"
      />
      <ActionButton
        testID="video-custom-forward"
        :title="FORWARD_TITLE"
        :color="color"
        @press="player.seekBy(SEEK_SECONDS)"
      />
      <ActionButton
        testID="video-custom-replay"
        title="Replay"
        :color="color"
        @press="player.replay()"
      />
    </view>
    <ChoiceRow
      testID="video-custom-rate"
      label="playbackRate"
      :color="color"
      :value="rate.playbackRate"
      :options="RATES"
      @change="value => (player.playbackRate = value)"
    />
    <ToggleRow
      testID="video-custom-muted"
      label="muted"
      :value="muted.muted"
      :color="color"
      @change="value => (player.muted = value)"
    />
    <ToggleRow
      testID="video-custom-loop"
      label="loop"
      :value="isLooping"
      :color="color"
      @change="setLoop"
    />
  </Scenario>
</template>
