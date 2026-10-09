<script lang="ts" module>
  // KeyboardAvoidingView over the shared `createKeyboardAvoidingModel`, which holds the frame, the
  // last keyboard event and the inset rules of RN's class
  // The two structural shapes ('nested' and 'wrapper') are the two markup branches below
  import type { IKeyboardAvoidingViewProps } from './keyboard-avoiding-view-props';

  export type { IKeyboardAvoidingViewProps };
</script>

<script lang="ts">
  import {
    Keyboard,
    Platform,
    type IEventSubscription,
    type ISymbioteEvent,
  } from '@symbiote-native/engine';
  import { createAttachmentsSync } from '../../runes/attachments';
  import type { ShimElement } from '../../dom-shim';
  import {
    createKeyboardAvoidingModel,
    keyboardAvoidingEventNamesFor,
    readPrefersCrossFadeTransitions,
    resolveKeyboardAvoidingLayout,
    resolveAccessibilityProps,
    DEFAULT_VERTICAL_OFFSET,
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
  // A device setting that cannot change mid-session, a plain `let` since nothing renders it
  let prefersCrossFadeTransitions = false;

  // The props are live getters, so a changed prop reaches the model on its next event
  const model = createKeyboardAvoidingModel({
    options: () => ({ behavior, enabled, keyboardVerticalOffset }),
    setInset: value => {
      inset = value;
    },
    prefersCrossFade: () => prefersCrossFadeTransitions,
  });

  // No state is read in the callback body, so this runs once per mount and cleans up once
  $effect(() => {
    const events = keyboardAvoidingEventNamesFor(Platform.OS);
    const subscriptions: IEventSubscription[] = [
      Keyboard.addListener(events.show, model.keyboardShown),
      Keyboard.addListener(events.hide, model.keyboardHidden),
    ];
    // Nobody awaits this, the core wrapper answers false on a failed native read
    void readPrefersCrossFadeTransitions().then(prefers => {
      prefersCrossFadeTransitions = prefers;
    });
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  });

  function handleLayout(event: ISymbioteEvent): void {
    model.laidOut(event.nativeEvent.layout);
    onLayout?.(event);
  }

  // Disabled forces the inset to 0, so every behavior mode renders the view untouched
  const effectiveInset = $derived(enabled ? inset : 0);

  const layout = $derived(
    resolveKeyboardAvoidingLayout({
      behavior,
      effectiveInset,
      initialHeight: model.initialHeight(),
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

  // Bound to the OUTER wrapper, the node this component's own style lands on in both layouts
  let hostShim = $state.raw<ShimElement | null>(null);
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, passthrough);
  });
</script>

{#if layout.kind === 'nested'}
  <view p={wrapperBag} bind:this={hostShim}>
    <view p={innerBag}>
      {@render children?.()}
    </view>
  </view>
{:else}
  <view p={wrapperBag} bind:this={hostShim}>
    {@render children?.()}
  </view>
{/if}
