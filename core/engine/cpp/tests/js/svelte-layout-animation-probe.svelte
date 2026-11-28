<script>
  // What the Reanimated screen of the Svelte example animates, in rows that come and go
  import {
    FadeIn,
    FadeOut,
    LayoutAnimationConfig,
    LinearTransition,
    SharedTransitionBoundary,
  } from '../../../../../packages/reanimated/src/svelte/index';
  import '../../../../../packages/reanimated/src/register';
  import { probe } from './svelte-reanimated-handle';

  let isShown = $state(false);
  const rows = Array.from({ length: 10 }, (_, index) => index);
  probe.show = next => (isShown = next);
</script>

<view>
  {#if isShown}
    {#each rows as row (row)}
      <view
        p={{ entering: FadeIn, exiting: FadeOut, layout: LinearTransition }}
      >
        <text>{row}</text>
      </view>
    {/each}
    <LayoutAnimationConfig skipEntering skipExiting>
      <view p={{ entering: FadeIn, exiting: FadeOut }} />
    </LayoutAnimationConfig>
    <SharedTransitionBoundary isActive>
      <view p={{ sharedTransitionTag: 'la-shared' }} />
    </SharedTransitionBoundary>
  {/if}
</view>
