// Mirrors @react-navigation's useIsFocused.
//
// `create*`, not `use*`: this OWNS a signal and two emitter subscriptions. Solid reserves `use*`
// for consuming something that already exists, so a primitive that creates its own state and
// lifecycle is `createX` (<adapter_src_follows_framework_idioms>; the same reason the adapter
// spells its colour-scheme primitive `createColorScheme`).
//
// Starts `false` rather than guessing from stack position: the route's emitter only fires 'focus'
// once RNSScreen's native onAppear lands (../stack) or the screen mounts focused (../tabs,
// ../drawer) - a screen genuinely isn't focused at the instant it mounts, the same async gap real
// native transitions have.
//
// Subscribing SYNCHRONOUSLY in the body rather than from onMount, unlike React/Vue/Svelte: those
// have to defer past render, and Solid does not. It also matters here - the navigators emit the
// first 'focus' from a queued microtask after the screen subtree is built, and an onMount-based
// subscription would still be in the same effect queue, i.e. a race this simply does not enter.

import { createSignal, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import { NAVIGATION_EVENT_BLUR, NAVIGATION_EVENT_FOCUS } from '../../core';
import { requireNavigationScope } from '../navigation-context';

export function createIsFocused(): Accessor<boolean> {
  const scope = requireNavigationScope('createIsFocused');
  const [isFocused, setIsFocused] = createSignal(false);

  const { emitter } = scope();
  const unsubscribeFocus = emitter.addListener(NAVIGATION_EVENT_FOCUS, () =>
    setIsFocused(true),
  );
  const unsubscribeBlur = emitter.addListener(NAVIGATION_EVENT_BLUR, () =>
    setIsFocused(false),
  );

  onCleanup(() => {
    unsubscribeFocus();
    unsubscribeBlur();
  });

  return isFocused;
}
