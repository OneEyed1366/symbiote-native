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
  import { dlog, type IHostInstance } from '@symbiote-native/engine';
  import { resolveAccessibilityProps } from '@symbiote-native/components';
  import { toTemplateSafeProps } from '../renderer';

  let { children, ...rest }: IRefreshControlProps = $props();

  dlog('RefreshControl -> PullToRefreshView');
  dlog(`RefreshControl refreshing=${String(rest.refreshing)}`);
  if (rest.enabled !== undefined) dlog(`RefreshControl enabled=${String(rest.enabled)} (Android-only)`);
  if (rest.onRefresh !== undefined) dlog('RefreshControl onRefresh listener wired');

  // `style` collides with Svelte's own special-cased attribute name (renderer.ts's
  // TEMPLATE_KEY_UNMANGLE header comment) — renamed before the spread; `setAttributeOp`'s
  // `realPropName()` reverses it right before `routeProp`.
  const bag = $derived(toTemplateSafeProps(resolveAccessibilityProps(rest)));

  let hostRef = $state.raw<IHostInstance | null>(null);
</script>

<symbiote-refresh-control {...bag} {@attach (node) => (hostRef = node)}>
  {@render children?.()}
</symbiote-refresh-control>
