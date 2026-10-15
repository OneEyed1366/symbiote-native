<script lang="ts">
  import { hostInstance } from '@symbiote-native/svelte/native-view-bridge';
  import { hooks } from './runes/hooks';
  import type { IAnimatedScrollViewProps } from './animated-scroll-view-props';

  // One scroll event per frame, so an animation that follows the scroll has a value every frame
  const EVERY_FRAME = 1;

  let {
    scrollViewOffset,
    ref,
    children,
    ...rest
  }: IAnimatedScrollViewProps = $props();

  const { useAnimatedRef, useObservedScrollOffset } = hooks;

  const ownRef = useAnimatedRef();
  let element: unknown = $state.raw(undefined);

  useObservedScrollOffset(ownRef, scrollViewOffset, scrollViewOffset !== undefined);

  $effect(() => {
    const node = hostInstance(element) ?? null;
    ownRef(node);
    ref?.(node);
  });
</script>

<scroll-view bind:this={element} p={{ scrollEventThrottle: EVERY_FRAME, ...rest }}>
  {@render children?.()}
</scroll-view>
