<script lang="ts">
  import { FullWindowOverlay } from '@symbiote-native/navigation/svelte';
  import type { IToastKind } from './toast-store';
  import { createToast, toastStore } from './use-toast';

  const TOAST_MS = 2_500;
  const TREE_KIND = 'tree' satisfies IToastKind;

  // Drawn by the screen below the modal, the overlay one rides in its own window above everything
  let { isOverlayModal }: { isOverlayModal: boolean } = $props();
  const toast = createToast();

  $effect(() => {
    if (toast.current === null) return;
    const timer = setTimeout(toastStore.hide, TOAST_MS);
    return () => clearTimeout(timer);
  });
</script>

{#snippet bubble(bubbleClass: string, text: string)}
  <view class={bubbleClass}>
    <text class="toast-text">{text}</text>
  </view>
{/snippet}

{#if toast.current !== null}
  {#if toast.current.kind === TREE_KIND}
    {@render bubble('toast toast-tree', 'Drawn by the screen below the modal')}
  {:else}
    <FullWindowOverlay unstable_accessibilityContainerViewIsModal={isOverlayModal}>
      {@render bubble('toast toast-overlay', 'Drawn in a FullWindowOverlay')}
    </FullWindowOverlay>
  {/if}
{/if}
