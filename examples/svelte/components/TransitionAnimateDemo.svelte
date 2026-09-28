<script lang="ts">
  // transition:fade needs getComputedStyle+Element.animate, animate:flip needs
  // getBoundingClientRect - both live on the dom-shim, not stock DOM globals.
  import { fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { dlog } from '@symbiote-native/engine';
  import ActionButton from './ActionButton.svelte';

  const ACCENT = '#ff3e00';

  let fadeBoxShown = $state(true);
  let flipItems = $state(['A', 'B', 'C', 'D']);

  function onShuffleFlipItems(): void {
    dlog(`onShuffleFlipItems before=${JSON.stringify(flipItems)}`);
    flipItems = [...flipItems].sort(() => Math.random() - 0.5);
    dlog(`onShuffleFlipItems after=${JSON.stringify(flipItems)}`);
  }

  // Temporary: wraps flip() to log whether it throws, since a throw here would abort the whole
  // each-block reorder silently.
  function loggedFlip(
    node: Element,
    fromTo: { from: DOMRect; to: DOMRect },
    params?: Parameters<typeof flip>[2],
  ): ReturnType<typeof flip> {
    try {
      const config = flip(node, fromTo, params);
      dlog(`flip ok from=${JSON.stringify(fromTo.from)} to=${JSON.stringify(fromTo.to)}`);
      return config;
    } catch (error) {
      dlog(`flip threw: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
</script>

<!-- PASS: the box fades smoothly in/out (not an instant pop); shuffling glides tiles to their
     new slot instead of jumping there. -->
<text class="section-label">transition:fade · animate:flip</text>
<view class="section-tight">
  <ActionButton
    testID="fade-toggle"
    title={fadeBoxShown ? 'Hide (transition:fade)' : 'Show (transition:fade)'}
    onPress={() => (fadeBoxShown = !fadeBoxShown)}
    color={ACCENT}
  />
  {#if fadeBoxShown}
    <view
      testID="fade-box"
      class="filter-tile"
      transition:fade={{ duration: 220 }}
    >
      <text class="tile-text">fading box</text>
    </view>
  {/if}
  <ActionButton
    testID="flip-shuffle"
    title="Shuffle (animate:flip)"
    onPress={onShuffleFlipItems}
    color={ACCENT}
  />
  <view class="row">
    {#each flipItems as tile (tile)}
      <view class="filter-tile" animate:loggedFlip={{ duration: 260 }}>
        <text class="tile-text">{tile}</text>
      </view>
    {/each}
  </view>
</view>
