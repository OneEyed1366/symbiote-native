<script lang="ts" module>
  // Host primitive for app code. Per svelte-adapter-custom-renderer skill: props reach the
  // intrinsic as ordinary per-key attributes (`{...rest}`), exactly like Vue's View spreading
  // props and letting patchProp route each one — the official custom-renderer API dispatches
  // every attribute through `renderer.ts`'s `setAttribute`, same entry point `routeProp` already
  // gives every other adapter. `children` is pulled out first: it is a Svelte-specific field (a
  // Snippet), never forwarded as an attribute, mirroring why every adapter's IViewProps is
  // declared per-adapter (CLAUDE.md <prop_types_split_agnostic_vs_per_adapter>) rather than
  // shared verbatim.
  import type { IViewProps } from './view-props';

  export type { IViewProps };
</script>

<script lang="ts">
  import { toTemplateSafeProps } from '../renderer';
  import type { IHostInstance } from '@symbiote-native/engine';

  let { children, id, nativeID, ...rest }: IViewProps = $props();

  // `{@attach fn}` on a component lands as a SYMBOL-keyed prop, so it rides in `rest` alongside
  // the ordinary attribute keys. Svelte's own compiled spread handling
  // (dom/elements/attributes.js) already walks `Object.getOwnPropertySymbols` on whatever gets
  // spread onto the intrinsic below and auto-invokes any `{@attach}` entry it finds — this is the
  // one directive-shaped Svelte feature that IS legal on a component, hence the only way an
  // author reaches the committed host node — see runes/attachments.ts. No manual re-sync needed
  // (an earlier version double-invoked forwarded attachments this way; removed 2026-08-16).
  let hostRef = $state.raw<IHostInstance | null>(null);

  // RN's modern `id` is just a W3C-named alias for `nativeID`: View.js copies it over
  // (`processedProps.nativeID = id`), so `id` wins when both are set. Fold it here and drop the
  // raw `id` key so it never reaches Fabric — mirrors React's `resolveId` in
  // `adapters/react/src/components.ts`.
  const resolvedNativeID = $derived(id === undefined ? nativeID : id);
  // `style` collides with Svelte's own special-cased attribute name — see renderer.ts's
  // TEMPLATE_KEY_UNMANGLE header comment. Renamed here, right before the spread; never affects
  // `rest` itself (used unmangled above, for attachments).
  const templateProps = $derived(toTemplateSafeProps(rest));
</script>

<symbiote-view
  {...templateProps}
  nativeID={resolvedNativeID}
  {@attach (node) => (hostRef = node)}>
  {@render children?.()}
</symbiote-view>
