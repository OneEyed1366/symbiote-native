<script lang="ts">
  import ActionButton from '../components/ActionButton.svelte';
  import Scenario from '../components/Scenario.svelte';
  import FeedItem from './FeedItem.svelte';
  import { FEED_CLIPS } from './video-shared';

  const { color }: { color: string } = $props();

  let active = $state(0);
</script>

<Scenario
  testID="video-reels-scenario"
  title="Play one clip at a time in a feed"
  why="Reels and story feeds keep a single player busy: the clip on screen plays and the others hold no source, so memory and data stay low. Swiping hands the player to the next clip."
  steps={['Press Next clip a few times', 'Look at the status line of each clip']}
  expect="Only the active clip is playing, with its status moving to readyToPlay. Every other clip says unloaded."
>
  {#each FEED_CLIPS as uri, index (`${uri}-${String(index)}`)}
    <FeedItem {uri} isActive={index === active} {index} />
  {/each}
  <view class="button-row">
    <ActionButton testID="video-reels-prev" title="Previous clip" {color} onPress={() => (active = Math.max(0, active - 1))} />
    <ActionButton testID="video-reels-next" title="Next clip" {color} onPress={() => (active = Math.min(FEED_CLIPS.length - 1, active + 1))} />
  </view>
</Scenario>
