<script lang="ts">
  // The per-route setup boundary: one instance per mounted route, so each route subtree reads its
  // OWN scope (its own route/emitter) invisible to its siblings. Stack keeps every pushed route
  // mounted as a sibling subtree; Tab/Drawer mount only the focused one - either way each needs a
  // distinct provided value, which is an inherent property of any hierarchical
  // dependency-injection scheme, Svelte's context included.
  //
  // `value` is a $props() field, so reading it inside the boxed getter below is a LIVE read: a
  // later change (setParams producing a new route object for the same key) still reaches every
  // consumer without re-running setContext, which Svelte only honours during init anyway.
  import type { Snippet } from 'svelte';
  import { setNavigationScope } from './navigation-context';
  import type { INavigationScopeValue } from './navigation-context';

  let { value, children }: { value: INavigationScopeValue; children?: Snippet } = $props();

  setNavigationScope({
    get current(): INavigationScopeValue {
      return value;
    },
  });
</script>

{@render children?.()}
