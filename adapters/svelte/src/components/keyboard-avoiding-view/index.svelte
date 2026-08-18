<script lang="ts" module>
  // KeyboardAvoidingView: composes a wrapper View and shifts it as the keyboard shows/hides. The
  // inset math + the behavior -> style/structure decision live framework-agnostic in
  // @symbiote-native/components (render-keyboard-avoiding-view, shared verbatim with React/Vue);
  // this adapter supplies only the lifecycle: $state for the inset, a mutable frame/initialHeight
  // pair (NOT $state — changing them alone shouldn't re-render, same non-reactive-ref shape as
  // React's frameRef/initialHeightRef and Vue's plain `let frame`), an $effect subscribing to the
  // Keyboard module and reading the cross-fade device setting once (mirrors React's useEffect /
  // Vue's onMounted+onUnmounted pair), and the wrapper assembly around the Snippet children.
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
    Platform,
    dlog,
    type IEventSubscription,
    type ISymbioteEvent,
  } from '@symbiote-native/engine';
  import { createAttachmentsSync } from '../../runes/attachments';
  import type { ShimElement } from '../../dom-shim';
  import {
    computeInset,
    keyboardAvoidingEventNamesFor,
    readPrefersCrossFadeTransitions,
    readKeyboardFrame,
    readLayoutFrame,
    resolveKeyboardAvoidingLayout,
    resolveAccessibilityProps,
    DEFAULT_VERTICAL_OFFSET,
    type IMeasuredFrame,
  } from '@symbiote-native/components';

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
  // A device accessibility setting, not component state: it cannot change mid-session, and nothing
  // in the markup reads it — it only feeds the next keyboard event's math — so a plain `let`, not
  // $state. Resolves false on Android and when the native getter is absent.
  let prefersCrossFadeTransitions = false;

  function onShow(payload: unknown): void {
    const keyboard = readKeyboardFrame(payload);
    // `behavior` and `inset` are both read HERE, at event time, never captured when this handler
    // was built: Svelte compiles a destructured prop into a live getter, so a `behavior` changed
    // after mount reaches the math on the next event, and 'height' mode feeds back the inset
    // CURRENTLY applied (RN's this.state.bottom) to cancel the shrink its own wrapper caused.
    const next = computeInset(frame, keyboard, keyboardVerticalOffset, {
      behavior,
      previousInset: inset,
      prefersCrossFadeTransitions,
    });
    dlog(`KeyboardAvoidingView show -> inset ${next}`);
    inset = next;
  }
  function onHide(): void {
    dlog('KeyboardAvoidingView hide -> inset 0');
    inset = 0;
  }

  // No reactive state is read synchronously in this callback body (only inside onShow/onHide,
  // which run later at event-time via closures over the live props and `inset`), so this effect has
  // zero tracked dependencies and runs exactly once per mount/unmount — the same subscribe-once/
  // cleanup-once shape as Vue's onMounted+onUnmounted pair. TWO listeners, never three: RN's own
  // comment warns that a change-frame notification arrives BEFORE the hide one on an undocked iOS
  // keyboard, so subscribing to it applies a frame captured mid-dismissal.
  $effect(() => {
    const events = keyboardAvoidingEventNamesFor(Platform.OS);
    const subscriptions: IEventSubscription[] = [
      Keyboard.addListener(events.show, onShow),
      Keyboard.addListener(events.hide, onHide),
    ];
    // Through the core wrapper, not AccessibilityInfo directly: nobody awaits this, and the
    // engine's iOS getters reject on a native error, so the fallback-to-false lives there once.
    void readPrefersCrossFadeTransitions().then(prefers => {
      prefersCrossFadeTransitions = prefers;
    });
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

  const wrapperBag = $derived({
    ...resolveAccessibilityProps(passthrough),
    style: layout.wrapperStyle,
    class: className,
    onLayout: handleLayout,
  });

  const innerBag = $derived(
    layout.kind === 'nested' ? { style: layout.innerStyle } : undefined,
  );

  // See View.svelte's note on `{@attach}` — bound to the OUTER wrapper, which is the node
  // this component's own style lands on in both the nested and flat layouts.
  let hostShim = $state.raw<ShimElement | null>(null);
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, passthrough);
  });
</script>

{#if layout.kind === 'nested'}
  <symbiote-view p={wrapperBag} bind:this={hostShim}>
    <symbiote-view p={innerBag}>
      {@render children?.()}
    </symbiote-view>
  </symbiote-view>
{:else}
  <symbiote-view p={wrapperBag} bind:this={hostShim}>
    {@render children?.()}
  </symbiote-view>
{/if}
