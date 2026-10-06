<script setup lang="ts">
import { ref } from 'vue';
import { VideoView, useVideoPlayer } from '@symbiote-native/video/vue';
import type { IVideoAudioMixingMode, IVideoContentFit } from '@symbiote-native/video/vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Explorer from '../components/Explorer.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { FIT_OPTIONS, METADATA_SOURCE, MIXING_OPTIONS } from './video-shared';

defineProps<{ color: string }>();

const player = useVideoPlayer(() => METADATA_SOURCE);
const isNowPlaying = ref(false);
const mixing = ref<IVideoAudioMixingMode>('auto');
const fit = ref<IVideoContentFit>('contain');
const isTimecodes = ref(true);
const isLinear = ref(false);
const isPitchKept = ref(true);
const isScreenOn = ref(true);
const isBackground = ref(false);

function setPitch(value: boolean): void {
  player.value.preservesPitch = value;
  isPitchKept.value = value;
}

function setScreenOn(value: boolean): void {
  player.value.keepScreenOnWhilePlaying = value;
  isScreenOn.value = value;
}

function setBackground(value: boolean): void {
  player.value.staysActiveInBackground = value;
  isBackground.value = value;
}

function setNowPlaying(value: boolean): void {
  player.value.showNowPlayingNotification = value;
  isNowPlaying.value = value;
}

function setMixing(value: IVideoAudioMixingMode): void {
  player.value.audioMixingMode = value;
  mixing.value = value;
}
</script>

<template>
  <Explorer
    testID="video-explorer"
    :color="color"
  >
    <Card
      testID="video-playground"
      title="Every option"
    >
      <VideoView
        testID="video-playground-view"
        :player="player"
        :nativeControls="true"
        :contentFit="fit"
        :showsTimecodes="isTimecodes"
        :requiresLinearPlayback="isLinear"
        class="vid-video"
      />
      <ChoiceRow
        testID="video-fit"
        label="contentFit"
        :color="color"
        :value="fit"
        :options="FIT_OPTIONS"
        @change="value => (fit = value)"
      />
      <ToggleRow
        testID="video-timecodes"
        label="showsTimecodes (iOS)"
        :value="isTimecodes"
        :color="color"
        @change="value => (isTimecodes = value)"
      />
      <ToggleRow
        testID="video-linear"
        label="requiresLinearPlayback: no skipping"
        :value="isLinear"
        :color="color"
        @change="value => (isLinear = value)"
      />
      <ToggleRow
        testID="video-pitch"
        label="preservesPitch (try 2x speed)"
        :value="isPitchKept"
        :color="color"
        @change="setPitch"
      />
      <ToggleRow
        testID="video-keep-awake"
        label="keepScreenOnWhilePlaying"
        :value="isScreenOn"
        :color="color"
        @change="setScreenOn"
      />
      <ToggleRow
        testID="video-background"
        label="staysActiveInBackground (needs the audio background mode)"
        :value="isBackground"
        :color="color"
        @change="setBackground"
      />
      <ToggleRow
        testID="video-now-playing"
        label="showNowPlayingNotification (lock screen card with the metadata)"
        :value="isNowPlaying"
        :color="color"
        @change="setNowPlaying"
      />
      <ChoiceRow
        testID="video-mixing"
        label="audioMixingMode: how it shares audio with other apps"
        :color="color"
        :value="mixing"
        :options="MIXING_OPTIONS"
        @change="setMixing"
      />
    </Card>
  </Explorer>
</template>
