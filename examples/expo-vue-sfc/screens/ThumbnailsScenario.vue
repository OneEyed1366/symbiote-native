<script setup lang="ts">
import { ref } from 'vue';
import { Image } from '@symbiote-native/image/vue';
import { useVideoPlayer } from '@symbiote-native/video/vue';
import type { VideoThumbnail } from '@symbiote-native/video/vue';
import ActionButton from '../components/ActionButton.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import { MP4_URI, THUMB_MAX_WIDTH, THUMB_TIMES, errorLine, formatTime } from './video-shared';

defineProps<{ color: string }>();

const player = useVideoPlayer(() => MP4_URI);
const thumbnails = ref<VideoThumbnail[]>([]);
const line = ref('not generated');

async function generate(): Promise<void> {
  line.value = 'generating…';
  try {
    const result = await player.value.generateThumbnailsAsync(THUMB_TIMES, { maxWidth: THUMB_MAX_WIDTH });
    thumbnails.value = result;
    line.value = `${result.length} frames, ${result[0]?.width ?? 0}x${result[0]?.height ?? 0}`;
  } catch (error) {
    line.value = `failed: ${errorLine(error)}`;
  }
}
</script>

<template>
  <Scenario
    testID="video-thumbs-scenario"
    title="Show preview frames for a seek bar or a gallery"
    why="Players show a frame under the finger while scrubbing and galleries show a cover picture. The frames come from the player itself, no extra download."
    :steps="['Press Generate frames and wait a few seconds']"
    expect="Four pictures appear in a row, taken at 1, 10, 30 and 60 seconds, each with its requested time under it."
  >
    <ActionButton
      testID="video-thumbs-generate"
      title="generateThumbnailsAsync"
      :color="color"
      @press="generate"
    />
    <ResultRow
      testID="video-thumbs-result"
      label="Result"
      :value="line"
    />
    <view class="vid-thumb-row">
      <view
        v-for="thumbnail in thumbnails"
        :key="thumbnail.requestedTime"
      >
        <Image
          :testID="`video-thumb-${thumbnail.requestedTime}`"
          :source="thumbnail"
          contentFit="cover"
          class="vid-thumb"
        />
        <text class="capability-label">
          {{ formatTime(thumbnail.requestedTime) }}
        </text>
      </view>
    </view>
  </Scenario>
</template>
