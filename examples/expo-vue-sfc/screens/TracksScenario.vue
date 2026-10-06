<script setup lang="ts">
import { computed, ref } from 'vue';
import { VideoView, useVideoPlayer } from '@symbiote-native/video/vue';
import ActionButton from '../components/ActionButton.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import PlayerStatusRows from './PlayerStatusRows.vue';
import { usePlayerEvent, usePlayerEventOrNull } from './video-parts';
import { HLS_URI, MP4_URI, TIME_UPDATE_SECONDS, errorLine, trackLabel, trackSummary } from './video-shared';

defineProps<{ color: string }>();

const player = useVideoPlayer(
  () => HLS_URI,
  instance => {
    instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
  },
);
const load = usePlayerEventOrNull(player, 'sourceLoad');
const subtitle = usePlayerEvent(player, 'subtitleTrackChange', { subtitleTrack: player.value.subtitleTrack });
const audio = usePlayerEvent(player, 'audioTrackChange', { audioTrack: player.value.audioTrack });
const video = usePlayerEvent(player, 'videoTrackChange', { videoTrack: player.value.videoTrack });
const source = ref('adaptive stream');

const subtitles = computed(() => load.value?.availableSubtitleTracks ?? []);
const audios = computed(() => load.value?.availableAudioTracks ?? []);
const summary = computed(() =>
  load.value === null
    ? 'not loaded'
    : trackSummary(load.value.duration, load.value.availableVideoTracks.length, audios.value.length, subtitles.value.length),
);
const quality = computed(() => {
  const track = video.value.videoTrack;
  return track === null ? 'unknown' : `${track.size.width}x${track.size.height}`;
});
const subtitleText = computed(() => trackLabel(subtitle.value.subtitleTrack));
const audioText = computed(() => trackLabel(audio.value.audioTrack));

async function switchTo(name: string, uri: string): Promise<void> {
  source.value = `loading ${name}…`;
  try {
    await player.value.replaceAsync(uri);
    source.value = name;
  } catch (error) {
    source.value = `failed: ${errorLine(error)}`;
  }
}
</script>

<template>
  <Scenario
    testID="video-tracks-scenario"
    title="Pick a subtitle, a language and see the quality"
    why="Streams ship several audio languages, subtitles and bitrates. An app lists them from the player and lets the user choose, or swaps the whole source for the next episode."
    :steps="['Press play on the native controls', 'Press a subtitle button, then an audio button', 'Press Switch to the MP4 and back']"
    expect="The lists show what the stream offers. Choosing a subtitle shows its text on the picture and updates the line below, and the quality line shows the current resolution."
  >
    <VideoView
      testID="video-tracks"
      :player="player"
      :nativeControls="true"
      class="vid-video"
    />
    <PlayerStatusRows
      :player="player"
      prefix="video-tracks"
    />
    <ResultRow
      testID="video-tracks-source"
      label="Source"
      :value="source"
    />
    <ResultRow
      testID="video-tracks-duration"
      label="sourceLoad"
      :value="summary"
    />
    <ResultRow
      testID="video-tracks-quality"
      label="videoTrack"
      :value="quality"
    />
    <ResultRow
      testID="video-tracks-subtitle"
      label="subtitleTrack"
      :value="subtitleText"
    />
    <ResultRow
      testID="video-tracks-audio"
      label="audioTrack"
      :value="audioText"
    />
    <view class="button-row">
      <ActionButton
        testID="video-subtitle-off"
        title="Subtitles off"
        :color="color"
        @press="player.subtitleTrack = null"
      />
      <ActionButton
        v-for="item in subtitles"
        :key="item.id ?? item.label"
        :testID="`video-subtitle-${item.language}`"
        :title="item.label"
        :color="color"
        @press="player.subtitleTrack = item"
      />
    </view>
    <view class="button-row">
      <ActionButton
        v-for="item in audios"
        :key="item.id ?? item.label"
        :testID="`video-audio-${item.language}`"
        :title="item.label"
        :color="color"
        @press="player.audioTrack = item"
      />
    </view>
    <view class="button-row">
      <ActionButton
        testID="video-switch-mp4"
        title="Switch to the MP4"
        :color="color"
        @press="switchTo('MP4', MP4_URI)"
      />
      <ActionButton
        testID="video-switch-hls"
        title="Switch back to the stream"
        :color="color"
        @press="switchTo('adaptive stream', HLS_URI)"
      />
    </view>
  </Scenario>
</template>
