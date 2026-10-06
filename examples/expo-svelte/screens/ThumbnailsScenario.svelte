<script lang="ts">
  import { Image } from '@symbiote-native/image/svelte';
  import { useVideoPlayer } from '@symbiote-native/video/svelte';
  import type { VideoThumbnail } from '@symbiote-native/video/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { MP4_URI, THUMB_MAX_WIDTH, THUMB_TIMES, errorLine, formatTime } from './video-shared';

  const { color }: { color: string } = $props();

  const player = useVideoPlayer(() => MP4_URI);
  let thumbnails = $state<VideoThumbnail[]>([]);
  let line = $state('not generated');

  async function generate(): Promise<void> {
    line = 'generating…';
    try {
      const result = await player.current.generateThumbnailsAsync(THUMB_TIMES, { maxWidth: THUMB_MAX_WIDTH });
      thumbnails = result;
      line = `${result.length} frames, ${result[0]?.width ?? 0}x${result[0]?.height ?? 0}`;
    } catch (error) {
      line = `failed: ${errorLine(error)}`;
    }
  }
</script>

<Scenario
  testID="video-thumbs-scenario"
  title="Show preview frames for a seek bar or a gallery"
  why="Players show a frame under the finger while scrubbing and galleries show a cover picture. The frames come from the player itself, no extra download."
  steps={['Press Generate frames and wait a few seconds']}
  expect="Four pictures appear in a row, taken at 1, 10, 30 and 60 seconds, each with its requested time under it."
>
  <ActionButton testID="video-thumbs-generate" title="generateThumbnailsAsync" {color} onPress={generate} />
  <ResultRow testID="video-thumbs-result" label="Result" value={line} />
  <view class="vid-thumb-row">
    {#each thumbnails as thumbnail (thumbnail.requestedTime)}
      <view>
        <Image testID={`video-thumb-${thumbnail.requestedTime}`} source={thumbnail} contentFit="cover" class="vid-thumb" />
        <text class="capability-label">{formatTime(thumbnail.requestedTime)}</text>
      </view>
    {/each}
  </view>
</Scenario>
