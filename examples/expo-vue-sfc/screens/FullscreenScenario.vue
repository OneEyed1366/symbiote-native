<script setup lang="ts">
import { computed, ref } from 'vue';
import { VideoAirPlayButton, VideoView, isPictureInPictureSupported, useVideoPlayer } from '@symbiote-native/video/vue';
import type { IVideoViewHandle } from '@symbiote-native/video/vue';
import ActionButton from '../components/ActionButton.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import { usePlayerEvent } from './video-parts';
import { FULLSCREEN_OPTIONS, MP4_URI, TIME_UPDATE_SECONDS, errorLine, pushLog } from './video-shared';

defineProps<{ color: string }>();

const PIP_SUPPORTED = String(isPictureInPictureSupported());

const view = ref<IVideoViewHandle | null>(null);
const player = useVideoPlayer(
  () => MP4_URI,
  instance => {
    instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
    instance.allowsExternalPlayback = true;
  },
);
const external = usePlayerEvent(player, 'isExternalPlaybackActiveChange', { isExternalPlaybackActive: player.value.isExternalPlaybackActive });
const externalText = computed(() => String(external.value.isExternalPlaybackActive));
const events = ref<string[]>([]);

function log(line: string): void {
  events.value = pushLog(events.value, line);
}

async function run(action: Promise<void> | undefined, name: string): Promise<void> {
  try {
    await action;
  } catch (error) {
    log(`${name} failed: ${errorLine(error)}`);
  }
}
</script>

<template>
  <Scenario
    testID="video-fullscreen-scenario"
    title="Go fullscreen, keep watching in a corner window, or cast"
    why="Players offer fullscreen for movies, picture in picture to keep a video over other apps, and AirPlay to send it to a TV."
    :steps="[
      'Press Fullscreen, then leave it with the system button',
      'Start playing, press Picture in picture and go to the home screen',
      'On iOS tap the AirPlay button and pick a device',
    ]"
    expect="Each action adds a line to the event log: fullscreen enter and exit, picture in picture start and stop. The video keeps playing in its small window, and AirPlay shows true while casting."
  >
    <VideoView
      ref="view"
      testID="video-fullscreen"
      :player="player"
      :nativeControls="true"
      :allowsPictureInPicture="true"
      :startsPictureInPictureAutomatically="true"
      :fullscreenOptions="FULLSCREEN_OPTIONS"
      class="vid-video"
      @fullscreenEnter="log('fullscreen enter')"
      @fullscreenExit="log('fullscreen exit')"
      @pictureInPictureStart="log('picture in picture start')"
      @pictureInPictureStop="log('picture in picture stop')"
      @firstFrameRender="log('first frame rendered')"
    />
    <ResultRow
      testID="video-pip-supported"
      label="isPictureInPictureSupported()"
      :value="PIP_SUPPORTED"
    />
    <ResultRow
      testID="video-airplay-active"
      label="isExternalPlaybackActiveChange"
      :value="externalText"
    />
    <view class="button-row">
      <ActionButton
        testID="video-play"
        title="Play"
        :color="color"
        @press="player.play()"
      />
      <ActionButton
        testID="video-enter-fullscreen"
        title="Fullscreen"
        :color="color"
        @press="run(view?.enterFullscreen(), 'enterFullscreen')"
      />
      <ActionButton
        testID="video-start-pip"
        title="Picture in picture"
        :color="color"
        @press="run(view?.startPictureInPicture(), 'startPictureInPicture')"
      />
      <ActionButton
        testID="video-stop-pip"
        title="Stop PiP"
        :color="color"
        @press="run(view?.stopPictureInPicture(), 'stopPictureInPicture')"
      />
    </view>
    <view class="capability-row">
      <text class="capability-label">
        AirPlay route picker (iOS)
      </text>
      <VideoAirPlayButton
        testID="video-airplay"
        tint="#94a3b8"
        :activeTint="color"
        class="vid-airplay"
      />
    </view>
    <ResultRow
      v-if="events.length === 0"
      testID="video-events-empty"
      label="Events"
      value="none yet"
    />
    <template v-else>
      <ResultRow
        v-for="line in events"
        :key="line"
        testID="video-event"
        label="event"
        :value="line"
      />
    </template>
  </Scenario>
</template>
