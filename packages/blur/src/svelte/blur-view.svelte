<script lang="ts">
  import DescriptorHost from '@symbiote-native/svelte/descriptor-host';
  import { hostInstance } from '@symbiote-native/svelte/native-view-bridge';
  import { renderBlurView, warnBlurProps, watchBlurTarget } from '../core';
  import type { IBlurViewSvelteProps } from './blur-props';

  const { children, blurTarget, ...rest }: IBlurViewSvelteProps = $props();
  let blurTargetId = $state<number | undefined>();

  // Цель приходит после монтирования и мутирует, поэтому эффект следит за ней
  $effect(() =>
    watchBlurTarget(hostInstance(blurTarget), id => {
      blurTargetId = id;
    }),
  );
  $effect(() => warnBlurProps({ ...rest }, blurTarget !== undefined));

  const descriptor = $derived(renderBlurView({ ...rest }, blurTargetId));
</script>

<DescriptorHost {descriptor} {children} />
