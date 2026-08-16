<script lang="ts" module>
  // KeyboardAvoidingView: composes a wrapper View and shifts it as the keyboard shows/hides. The
  // inset math + the behavior -> style/structure decision live framework-agnostic in
  // @symbiote-native/components (render-keyboard-avoiding-view, shared verbatim with React/Vue);
  // this adapter supplies only the lifecycle: $state for the inset, a mutable frame/initialHeight
  // pair (NOT $state — changing them alone shouldn't re-render, same non-reactive-ref shape as
  // React's frameRef/initialHeightRef and Vue's plain `let frame`), an $effect subscribing to the
  // Keyboard module (mirrors React's useEffect / Vue's onMounted+onUnmounted pair), and the
  // wrapper assembly around the Snippet children.
  //
  // render-keyboard-avoiding-view.ts does NOT return a Descriptor here (by its own design — it
  // returns a layout DESCRIPTION instead, because KAV wraps arbitrary user children the Descriptor
  // model can't carry), so there is no Descriptor-consumption question for this component at all;
  // the two structural shapes ('nested' vs 'wrapper') are written directly as the two markup
  // branches below.
  import type { IKeyboardAvoidingViewProps } from './keyboard-avoiding-view-props';

  export type { IKeyboardAvoidingViewProps };
</script>

<script lang="ts">
  import {
    Keyboard,
    KEYBOARD_EVENT,
    dlog,
    type IEventSubscription,
    type ISymbioteEvent,
  } from '@symbiote-native/engine';
  import type { IHostInstance } from '@symbiote-native/engine';
  import {
    computeInset,
    readKeyboardFrame,
    readLayoutFrame,
    resolveKeyboardAvoidingLayout,
    resolveAccessibilityProps,
    DEFAULT_VERTICAL_OFFSET,
    type IMeasuredFrame,
  } from '@symbiote-native/components';
  import { toTemplateSafeProps } from '../../renderer';

  let {
    behavior,
    enabled = true,
    keyboardVerticalOffset = DEFAULT_VERTICAL_OFFSET,
    contentContainerStyle,
    style,
    children,
    onLayout,
    class: className,
    ...passthrough
  }: IKeyboardAvoidingViewProps = $props();

  let inset = $state(0);
  // Mutable, not $state: changing the measured frame alone shouldn't re-render; it only feeds the
  // next keyboard event's inset math.
  let frame: IMeasuredFrame | undefined;
  let initialHeight: number | undefined;

  function onShow(payload: unknown): void {
    const keyboard = readKeyboardFrame(payload);
    const next = computeInset(frame, keyboard, keyboardVerticalOffset);
    dlog(`KeyboardAvoidingView show -> inset ${next}`);
    inset = next;
  }
  function onHide(): void {
    dlog('KeyboardAvoidingView hide -> inset 0');
    inset = 0;
  }

  // No reactive state is read synchronously in this callback body (only inside onShow/onHide,
  // which run later at event-time via closures over the live `keyboardVerticalOffset` prop), so
  // this effect has zero tracked dependencies and runs exactly once per mount/unmount — the same
  // subscribe-once/cleanup-once shape as Vue's onMounted+onUnmounted pair.
  $effect(() => {
    const subscriptions: IEventSubscription[] = [
      Keyboard.addListener(KEYBOARD_EVENT.didShow, onShow),
      Keyboard.addListener(KEYBOARD_EVENT.didChangeFrame, onShow),
      Keyboard.addListener(KEYBOARD_EVENT.didHide, onHide),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  });

  function handleLayout(event: ISymbioteEvent): void {
    const measured = readLayoutFrame(event.nativeEvent.layout);
    if (measured !== undefined) {
      frame = measured;
      if (initialHeight === undefined) initialHeight = measured.height;
    }
    onLayout?.(event);
  }

  // When disabled the inset is forced to 0, so every behavior mode renders the view untouched.
  const effectiveInset = $derived(enabled ? inset : 0);

  const layout = $derived(
    resolveKeyboardAvoidingLayout({
      behavior,
      effectiveInset,
      initialHeight,
      style,
      contentContainerStyle,
    }),
  );

  // `style` collides with Svelte's own special-cased attribute name (renderer.ts's
  // TEMPLATE_KEY_UNMANGLE header comment) — renamed before either spread below; `setAttributeOp`'s
  // `realPropName()` reverses it right before `routeProp`.
  const wrapperProps = $derived(
    toTemplateSafeProps({
      ...resolveAccessibilityProps(passthrough),
      style: layout.wrapperStyle,
      class: className,
      onLayout: handleLayout,
    }),
  );

  const innerProps = $derived(
    toTemplateSafeProps({
      style: layout.kind === 'nested' ? layout.innerStyle : undefined,
    }),
  );

  // Bound to the OUTER wrapper, which is the node this component's own style lands on in both
  // the nested and flat layouts. `{@attach}` forwarding happens automatically via Svelte's own
  // spread handling on `wrapperProps` below — see View.svelte's note.
  let hostRef = $state.raw<IHostInstance | null>(null);
</script>

{#if layout.kind === 'nested'}
  <symbiote-view {...wrapperProps} {@attach (node) => (hostRef = node)}>
    <symbiote-view {...innerProps}>
      {@render children?.()}
    </symbiote-view>
  </symbiote-view>
{:else}
  <symbiote-view {...wrapperProps} {@attach (node) => (hostRef = node)}>
    {@render children?.()}
  </symbiote-view>
{/if}
