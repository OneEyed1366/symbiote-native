<script lang="ts">
  // The native view that scopes a shared element transition to the subtree it holds
  import type { Snippet } from 'svelte';
  import { hostProps } from '@symbiote-native/svelte/native-view-bridge';
  import {
    SHARED_TRANSITION_BOUNDARY_VIEW,
    sharedTransitionBoundaryProps,
  } from '../core/shared-transition-boundary';

  let { isActive, children }: { isActive: boolean; children?: Snippet } =
    $props();
</script>

<svelte:element
  this={SHARED_TRANSITION_BOUNDARY_VIEW}
  {@attach hostProps(sharedTransitionBoundaryProps(isActive))}
>
  {@render children?.()}
</svelte:element>
