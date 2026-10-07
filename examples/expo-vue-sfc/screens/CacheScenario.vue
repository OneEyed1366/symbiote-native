<script setup lang="ts">
import { ref } from 'vue';
import {
  clearVideoCacheAsync,
  getCurrentVideoCacheSize,
  setVideoCacheSizeAsync,
} from '@symbiote-native/video/vue';
import ActionButton from '../components/ActionButton.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import CachedClip from './CachedClip.vue';
import { BYTES_PER_MB, CACHE_LIMIT_BYTES, errorLine } from './video-shared';

defineProps<{ color: string; isMounted: boolean }>();

const line = ref('press Read size');

async function run(name: string, action: () => Promise<void> | void): Promise<void> {
  try {
    await action();
    line.value = `${name} ok, cache is ${(getCurrentVideoCacheSize() / BYTES_PER_MB).toFixed(1)} MB`;
  } catch (error) {
    line.value = `${name} failed: ${errorLine(error)}`;
  }
}

const readSize = () => run('getCurrentVideoCacheSize', () => undefined);
const setLimit = () => run('setVideoCacheSizeAsync', () => setVideoCacheSizeAsync(CACHE_LIMIT_BYTES));
const clearAll = () => run('clearVideoCacheAsync', clearVideoCacheAsync);
</script>

<template>
  <Scenario
    testID="video-cache-scenario"
    title="Replay a video without downloading it again"
    why="With useCaching a source is stored on disk while it plays, so a repeat view works on a poor connection and costs no traffic. The cache has a size limit the app can set."
    :steps="[
      'With the players mounted, play the small clip to the end, then Read size',
      'Turn the players off at the top of the screen',
      'Press Set limit 100 MB, then Clear cache, then Read size',
    ]"
    expect="The size grows after playing the clip. With players mounted the limit and clear calls report an error, with players off they succeed and the size drops to 0."
  >
    <CachedClip v-if="isMounted" />
    <ResultRow
      testID="video-cache-line"
      label="Cache"
      :value="line"
    />
    <view class="button-row">
      <ActionButton
        testID="video-cache-size"
        title="Read size"
        :color="color"
        @press="readSize"
      />
      <ActionButton
        testID="video-cache-limit"
        title="Set limit 100 MB"
        :color="color"
        @press="setLimit"
      />
      <ActionButton
        testID="video-cache-clear"
        title="Clear cache"
        :color="color"
        @press="clearAll"
      />
    </view>
  </Scenario>
</template>
