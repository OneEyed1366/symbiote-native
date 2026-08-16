<script lang="ts" module>
  // See View.svelte's header comment — same per-attribute spread design
  // (svelte-adapter-custom-renderer skill). No IResponderProps here, matching every other
  // adapter's ITextProps.
  import type { ITextProps } from './text-props';

  export type { ITextProps };
</script>

<script lang="ts">
  import { toTemplateSafeProps } from '../renderer';
  import type { IHostInstance } from '@symbiote-native/engine';

  let { children, ...rest }: ITextProps = $props();

  // See View.svelte's note: `{@attach}` arrives as a symbol-keyed entry in the same rest object,
  // and Svelte's own spread handling invokes it automatically — no manual re-sync needed.
  let hostRef = $state.raw<IHostInstance | null>(null);

  // `style` collides with Svelte's own special-cased attribute name — see renderer.ts's
  // TEMPLATE_KEY_UNMANGLE header comment.
  const templateProps = $derived(toTemplateSafeProps(rest));
</script>

<symbiote-text {...templateProps} {@attach (node) => (hostRef = node)}>
  {@render children?.()}
</symbiote-text>
