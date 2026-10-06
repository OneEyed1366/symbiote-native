<script lang="ts">
  import { untrack } from 'svelte';
  import DescriptorHost from '@symbiote-native/svelte/descriptor-host';
  import { renderSymbolView, watchSymbolFont } from '../core';
  import type { ISymbolViewSvelteProps } from './symbol-props';

  const { fallback, ...rest }: ISymbolViewSvelteProps = $props();
  let isFontLoaded = $state(false);

  // Шрифт грузится один раз при монтировании, как в upstream, смена пропсов его не перезагружает
  $effect(() =>
    untrack(() =>
      watchSymbolFont({ ...rest }, isLoaded => {
        isFontLoaded = isLoaded;
      }),
    ),
  );

  const descriptor = $derived(renderSymbolView({ ...rest }, isFontLoaded));
</script>

{#if descriptor}
  <DescriptorHost {descriptor} />
{:else}
  {@render fallback?.()}
{/if}
