// Solid lifecycle wiring over the framework-agnostic addClipboardListener subscription (core/) —
// the Solid twin of React's useClipboard hook, Vue's composable, Svelte's rune and Angular's
// ClipboardService.connect(), adjusted for clipboard's single always-on subscription (no per-call
// config to resubscribe on).
//
// `primitives/` and `create*`, not `hooks/`/`use*`: Solid's ecosystem calls a composable reactive
// function a PRIMITIVE and reserves `use*` for consuming something that already exists. Full
// rationale in adapters/solid/src/primitives/create-color-scheme.ts's header.
//
// Returns an ACCESSOR, never a snapshot: a Solid component body runs ONCE, so a plain returned
// value would pin the consumer to `null` forever.
//
// Subscribes SYNCHRONOUSLY in the body with `onCleanup` for teardown, not from a mount hook
// (React's useEffect, Vue's onMounted, Svelte's $effect) — this closes the gap those three have
// between construction and subscription, in which a clipboard change fires and is never seen.
//
// Outside a component / createRoot there is no owner for `onCleanup`, so the subscription lives
// for the process — see create-color-scheme's header for the same documented caveat.
import { createSignal, onCleanup, type Accessor } from 'solid-js';
import {
  addClipboardListener,
  type EventSubscription,
  type IClipboardEvent,
} from '../../core';

export function createClipboard(): Accessor<IClipboardEvent | null> {
  const [event, setEvent] = createSignal<IClipboardEvent | null>(null);

  const subscription: EventSubscription = addClipboardListener(next => {
    setEvent(next);
  });

  onCleanup(() => {
    subscription.remove();
  });

  return event;
}
