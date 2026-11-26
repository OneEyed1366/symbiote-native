<script lang="ts">
  // The offset is asked for in the parent, before the scroll view that takes the ref exists
  import AnimatedScrollView from './animated-scroll-view.svelte';
  import { hooks } from './runes/hooks';

  const scroller = hooks.useAnimatedRef();
  hooks.useScrollOffset(scroller);
</script>

<AnimatedScrollView ref={scroller} />
