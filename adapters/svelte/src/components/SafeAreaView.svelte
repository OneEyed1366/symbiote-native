<script lang="ts" module>
  // SafeAreaView primitive. A plain view whose native side insets its children to the safe area
  // (notch, rounded corners, system bars). There is no JS-side translation; RN just renders the
  // native RCTSafeAreaView and lets the host do the inset math, so this maps style + children
  // straight onto the intrinsic — same object-bag pattern as View.svelte.
  import type { ISafeAreaViewProps } from './safe-area-view-props';

  export type { ISafeAreaViewProps };
</script>

<script lang="ts">
  import { dlog, type IHostInstance } from '@symbiote-native/engine';
  import { resolveAccessibilityProps } from '@symbiote-native/components';
  import { toTemplateSafeProps } from '../renderer';

  let { children, ...rest }: ISafeAreaViewProps = $props();

  dlog('SafeAreaView -> SafeAreaView');

  // `style` collides with Svelte's own special-cased attribute name (renderer.ts's
  // TEMPLATE_KEY_UNMANGLE header comment) — renamed before the spread; `setAttributeOp`'s
  // `realPropName()` reverses it right before `routeProp`.
  const bag = $derived(toTemplateSafeProps(resolveAccessibilityProps(rest)));

  let hostRef = $state.raw<IHostInstance | null>(null);
</script>

<symbiote-safe-area-view {...bag} {@attach (node) => (hostRef = node)}>
  {@render children?.()}
</symbiote-safe-area-view>
