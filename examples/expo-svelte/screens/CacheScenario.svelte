<script lang="ts">
  import {
    clearVideoCacheAsync,
    getCurrentVideoCacheSize,
    setVideoCacheSizeAsync,
  } from '@symbiote-native/video/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import CachedClip from './CachedClip.svelte';
  import { BYTES_PER_MB, CACHE_LIMIT_BYTES, errorLine } from './video-shared';

  const { color, isMounted }: { color: string; isMounted: boolean } = $props();

  let line = $state('press Read size');

  async function run(name: string, action: () => Promise<void> | void): Promise<void> {
    try {
      await action();
      line = `${name} ok, cache is ${(getCurrentVideoCacheSize() / BYTES_PER_MB).toFixed(1)} MB`;
    } catch (error) {
      line = `${name} failed: ${errorLine(error)}`;
    }
  }
</script>

<Scenario
  testID="video-cache-scenario"
  title="Replay a video without downloading it again"
  why="With useCaching a source is stored on disk while it plays, so a repeat view works on a poor connection and costs no traffic. The cache has a size limit the app can set."
  steps={[
    'With the players mounted, play the small clip to the end, then Read size',
    'Turn the players off at the top of the screen',
    'Press Set limit 100 MB, then Clear cache, then Read size',
  ]}
  expect="The size grows after playing the clip. With players mounted the limit and clear calls report an error, with players off they succeed and the size drops to 0."
>
  {#if isMounted}
    <CachedClip />
  {/if}
  <ResultRow testID="video-cache-line" label="Cache" value={line} />
  <view class="button-row">
    <ActionButton testID="video-cache-size" title="Read size" {color} onPress={() => run('getCurrentVideoCacheSize', () => undefined)} />
    <ActionButton testID="video-cache-limit" title="Set limit 100 MB" {color} onPress={() => run('setVideoCacheSizeAsync', () => setVideoCacheSizeAsync(CACHE_LIMIT_BYTES))} />
    <ActionButton testID="video-cache-clear" title="Clear cache" {color} onPress={() => run('clearVideoCacheAsync', clearVideoCacheAsync)} />
  </view>
</Scenario>
