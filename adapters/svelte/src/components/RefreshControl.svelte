<script lang="ts" module>
  // RefreshControl primitive. On iOS this is the PullToRefreshView Fabric node that lives INSIDE
  // a ScrollView (a sibling of the content container), giving the pull-to-refresh gesture. On
  // Android it is AndroidSwipeRefreshLayout and WRAPS the scroll view (a childless-on-iOS,
  // wraps-on-Android shape — see refresh-control-props.ts). `refreshing` is a controlled prop:
  // the parent owns it and pushes it down each commit; native reports the gesture via the direct
  // `topRefresh` event, which the engine routes to the host's `onRefresh` bag entry.
  import type { IRefreshControlProps } from './refresh-control-props';

  export type { IRefreshControlProps };
</script>

<script lang="ts">
  import { dlog } from '@symbiote-native/engine';
  import { resolveAccessibilityProps } from '@symbiote-native/components';
  import { createAttachmentsSync } from '../runes/attachments';
  import type { ShimElement } from '../dom-shim';

  let { children, ...rest }: IRefreshControlProps = $props();

  dlog('RefreshControl -> PullToRefreshView');
  dlog(`RefreshControl refreshing=${String(rest.refreshing)}`);
  if (rest.enabled !== undefined)
    dlog(`RefreshControl enabled=${String(rest.enabled)} (Android-only)`);
  if (rest.onRefresh !== undefined)
    dlog('RefreshControl onRefresh listener wired');

  const bag = $derived(resolveAccessibilityProps(rest));

  // See View.svelte's note on `{@attach}`.
  let hostShim = $state.raw<ShimElement | null>(null);
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, rest);
  });
</script>

<symbiote-refresh-control p={bag} bind:this={hostShim}>
  {@render children?.()}
</symbiote-refresh-control>
