// `{@attach fn}` is the only directive Svelte compiles on a component, so it is the one route
// for app code to the native node (`use:` and the rest are rejected there)

// An attachment arrives as a prop keyed by a symbol from `createAttachmentKey()`
// `Object.getOwnPropertySymbols()` over `$props()` or `...rest` finds it

// A dynamic `{@attach expr}` compiles to a stable wrapper with the reactivity inside it
// Diffing the prop misses a swap, so we delegate to Svelte's `attach()`, which re-runs the body

// Plain `.ts`, not a `.svelte.ts` rune file, because vitest has no Svelte plugin to compile it
import { attach } from 'svelte/internal/client';
import { createAttachmentKey, type Attachment } from 'svelte/attachments';
import { isSymbioteNode, type ISymbioteNode } from '@symbiote-native/engine';

// Read off a real key because `ATTACHMENT_KEY` is not public, the literal is the fallback
const ATTACHMENT_KEY_DESCRIPTION =
  createAttachmentKey().description ?? '@attach';

type IAttachmentSync = (
  host: ISymbioteNode | null | undefined,
  props: object,
) => void;

// Call once in component init, then run it from an `$effect` that depends only on the host ref
// The attachment values are read lazily inside `attach`, so it re-runs only when the host changes
export function createAttachmentsSync(): IAttachmentSync {
  return (host, props) => {
    if (host === null || host === undefined) return;
    forwardTo(host, props);
  };
}

function forwardTo(host: ISymbioteNode, props: object): void {
  for (const key of attachmentKeys(props)) {
    attach(host, () => Reflect.get(props, key));
  }
}

// For a wrapper that owns its host element: `{@attach forwardAttachments(() => props)}` on it
// Needs no state, as the attachment itself runs once the element exists
export function forwardAttachments(getProps: () => object): Attachment {
  return node => {
    if (isSymbioteNode(node)) forwardTo(node, getProps());
  };
}

// Replacement for `bind:this` on an element, which does not compile under `customRenderer`
export function captureHost(
  assign: (host: ISymbioteNode | null) => void,
): Attachment {
  return node => {
    if (!isSymbioteNode(node)) return;
    assign(node);
    return () => assign(null);
  };
}

// For wrappers that forward props by name, so the symbol keys of attachments get lost
// They re-spread just the attachment ones
export function pickAttachmentProps(props: object): Record<symbol, unknown> {
  const forwarded: Record<symbol, unknown> = {};
  for (const key of attachmentKeys(props)) {
    forwarded[key] = Reflect.get(props, key);
  }
  return forwarded;
}

function attachmentKeys(props: object): symbol[] {
  return Object.getOwnPropertySymbols(props).filter(
    key => key.description === ATTACHMENT_KEY_DESCRIPTION,
  );
}
