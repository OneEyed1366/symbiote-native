<script setup lang="ts">
import { computed } from 'vue';
import { VideoView, useVideoPlayer } from '@symbiote-native/video/vue';
import ResultRow from '../components/ResultRow.vue';
import { usePlayerEvent } from './video-parts';

// Only the active item has a source, the others unload, which is what a recycled feed does
const props = defineProps<{ uri: string; isActive: boolean; index: number }>();

const player = useVideoPlayer(
  () => (props.isActive ? props.uri : null),
  instance => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  },
);
const status = usePlayerEvent(player, 'statusChange', { status: player.value.status });
const viewId = computed(() => `video-reel-${String(props.index)}`);
const rowId = computed(() => `video-reel-status-${String(props.index)}`);
const rowLabel = computed(() => `Clip ${String(props.index + 1)}`);
const rowValue = computed(() => (props.isActive ? status.value.status : 'unloaded'));
</script>

<template>
  <view class="vid-feed-item">
    <VideoView
      :testID="viewId"
      :player="player"
      :nativeControls="false"
      contentFit="cover"
      class="vid-small"
    />
    <ResultRow
      :testID="rowId"
      :label="rowLabel"
      :value="rowValue"
    />
  </view>
</template>
