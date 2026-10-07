<script setup lang="ts">
import { ref } from 'vue';
import ActionButton from '../components/ActionButton.vue';
import Scenario from '../components/Scenario.vue';
import FeedItem from './FeedItem.vue';
import { FEED_CLIPS } from './video-shared';

defineProps<{ color: string }>();

const active = ref(0);
const CLIPS = FEED_CLIPS.map((uri, index) => ({ uri, index, key: `${uri}-${String(index)}` }));

function previous(): void {
  active.value = Math.max(0, active.value - 1);
}

function next(): void {
  active.value = Math.min(FEED_CLIPS.length - 1, active.value + 1);
}
</script>

<template>
  <Scenario
    testID="video-reels-scenario"
    title="Play one clip at a time in a feed"
    why="Reels and story feeds keep a single player busy: the clip on screen plays and the others hold no source, so memory and data stay low. Swiping hands the player to the next clip."
    :steps="['Press Next clip a few times', 'Look at the status line of each clip']"
    expect="Only the active clip is playing, with its status moving to readyToPlay. Every other clip says unloaded."
  >
    <FeedItem
      v-for="clip in CLIPS"
      :key="clip.key"
      :uri="clip.uri"
      :isActive="clip.index === active"
      :index="clip.index"
    />
    <view class="button-row">
      <ActionButton
        testID="video-reels-prev"
        title="Previous clip"
        :color="color"
        @press="previous"
      />
      <ActionButton
        testID="video-reels-next"
        title="Next clip"
        :color="color"
        @press="next"
      />
    </view>
  </Scenario>
</template>
