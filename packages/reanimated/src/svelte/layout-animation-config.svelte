<script lang="ts">
  // `skipEntering` and `skipExiting` as upstream has them: the children neither animate in nor out
  import type { Snippet } from 'svelte';
  import {
    layoutAnimationScopeProps,
    type ILayoutAnimationScope,
  } from '../core/layout-animation-scope';

  let {
    skipEntering,
    skipExiting,
    children,
  }: ILayoutAnimationScope & { children?: Snippet } = $props();
</script>

<view p={layoutAnimationScopeProps({ skipEntering, skipExiting })}>
  {@render children?.()}
</view>
