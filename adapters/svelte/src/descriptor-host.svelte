<script lang="ts">
  // Native view whose name is mixed case (`ViewManagerAdapter_*`), a literal tag would parse as a
  // component, so the tag is dynamic. Children go inside the root after the descriptor's own
  import type { Snippet } from 'svelte';
  import type { IDescriptor } from '@symbiote-native/components';
  import { hostProps } from './host-props';

  let {
    descriptor,
    children,
    ref = $bindable(),
  }: { descriptor: IDescriptor; children?: Snippet; ref?: unknown } = $props();
</script>

{#snippet own(node: IDescriptor)}
  {#each node.children as child}
    {#if typeof child === 'string'}
      {child}
    {:else}
      <svelte:element this={child.type} {@attach hostProps(child.props)}>
        {@render own(child)}
      </svelte:element>
    {/if}
  {/each}
{/snippet}

<svelte:element
  this={descriptor.type}
  bind:this={ref}
  {@attach hostProps(descriptor.props)}
>
  {@render own(descriptor)}
  {@render children?.()}
</svelte:element>
