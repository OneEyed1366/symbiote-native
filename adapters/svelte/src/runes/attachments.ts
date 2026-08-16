// `{@attach fn}` support for this adapter's components.
//
// WHY IT IS THE ONLY ROUTE. Svelte's compiler rejects `use:` / `transition:` / `class:` /
// `style:` on a COMPONENT ("This type of directive is not valid on components"), and app code
// here never authors a host element (skill §7), so a directive is unreachable by construction.
// Attachments are the exception: `{@attach fn}` compiles on a component, and `fromAction` from
// `svelte/attachments` converts any third-party action into one. That makes this the single seam
// through which a Svelte author reaches the committed native node, the twin of Vue's
// user-defined custom directive (which works untouched in adapters/vue).
//
// THE MECHANISM. `{@attach fn}` compiles to a prop whose key is a SYMBOL created by
// `createAttachmentKey()`, i.e. `Symbol(ATTACHMENT_KEY)`; Svelte's own spread path identifies one
// by `symbol.description === ATTACHMENT_KEY` (internal/client/dom/elements/attributes.js). Both
// `rest_props` and `spread_props` expose symbol keys through their `ownKeys` traps, so
// `Object.getOwnPropertySymbols()` over `$props()` — or over the `...rest` object — finds them.
//
// `createAttachmentsSync` IS NOT ALWAYS NEEDED ANYMORE (2026-08-16). Since the DOM-shim retirement,
// most components spread their resolved props object DIRECTLY onto a `symbiote-*` intrinsic
// (`{...rest}`), and Svelte's own compiled spread handling ALREADY walks
// `Object.getOwnPropertySymbols(next)` and auto-invokes any `ATTACHMENT_KEY`-tagged entry itself
// (`dom/elements/attributes.js`, confirmed by reading the source and by observing a double-fire
// when BOTH Svelte's auto-invocation and this module's manual sync ran on the same node). For a
// component whose template spread target is symbol-preserving (built via `{...props}` object-
// spread somewhere in its own chain — the common case: View/Text/Switch/Pressable/Modal/
// ScrollView/InputAccessoryView/ActivityIndicator/KeyboardAvoidingView/Image/RefreshControl/
// SafeAreaView), calling `createAttachmentsSync` is now REDUNDANT and was removed from those
// components' call sites (it double-invoked every forwarded attachment).
//
// IT IS STILL NEEDED wherever a component's actual template spread target is built through a
// STRING-KEYED-ONLY transform that drops symbol keys before the value ever reaches the markup —
// confirmed cases: `reduceProps` (modules/animated/*, uses `Object.keys`), `forwardProps` in
// text-input/index.svelte (uses `Object.entries`), virtualized-list/index.svelte's `outerBag`
// (built via explicit field-by-field assignment, no spread of the raw props at all), and
// image-background/index.svelte (the WRAPPER node's own props never receive `passthrough` at
// all — only the inner Image's props do, per render-image-background.ts). These components still
// call `createAttachmentsSync` and must keep doing so until/unless they're rewritten to route
// attachments through `pickAttachmentProps` merged into what actually gets spread (the fix
// `pickAttachmentProps`'s own doc comment below describes) — evaluate case by case, this is not
// interchangeable with a blanket removal.
//
// THE MECHANISM (continued). WHY IT DELEGATES TO SVELTE'S OWN `attach()` RATHER THAN CALLING THE
// FUNCTION DIRECTLY. A DYNAMIC attachment expression does not compile to a changing prop VALUE;
// the compiler emits a STABLE wrapper and moves the reactivity inside it:
//
//   {@attach which === 'first' ? first : second}
//   ->  [$.attachment()]: ($$node) => ($.get(which) === 'first' ? first : second)($$node)
//
// So identity-diffing the prop can never see the swap — the read that changes lives in the
// attachment BODY. `attach(node, getFn)` (internal/client/dom/elements/attachments.js) is exactly
// the machinery that handles this: a managed effect around `getFn()` for the identity case, and a
// branch effect around `fn(node)` so a reactive read inside the body re-runs it with the previous
// teardown fired first. Reimplementing it would be reimplementing it wrong.
//
// WHY A PLAIN `.ts` HERE AND NOT A `.svelte.ts` RUNE. The `$effect` stays at the component call
// site; this file holds no rune syntax. `.svelte.ts` files are compiled by `compileModule` in
// Metro (metro-svelte-transformer.cjs) but NOT by vitest, which has no Svelte plugin — so a rune
// file imported by every component would break every smoke test in this package. Same split, and
// the same call shape, as `createDescriptorChildrenSync`.
import { attach } from 'svelte/internal/client';
import { createAttachmentKey } from 'svelte/attachments';
import type { ISymbioteNode } from '@symbiote-native/engine';

// Read off a real key rather than hardcoded: `ATTACHMENT_KEY` lives in svelte/src/constants.js
// and is not part of the public export surface, so a rename there would otherwise silently
// disable every attachment. The literal is the fallback for a Svelte build that stops giving the
// key a description at all.
const ATTACHMENT_KEY_DESCRIPTION = createAttachmentKey().description ?? '@attach';

type IAttachmentSync = (host: ISymbioteNode | null | undefined, props: object) => void;

// Call once during component init, then drive it from an `$effect`:
//
//   const syncAttachments = createAttachmentsSync();
//   $effect(() => { syncAttachments(hostShim, rest); });
//
// That effect depends ONLY on the host ref — the attachment values are read lazily inside
// `attach`'s own effects, never in the caller's body — so it re-runs only when the host node
// itself changes, and Svelte then destroys the previous run's child effects (firing every
// teardown) before the new node is attached to.
export function createAttachmentsSync(): IAttachmentSync {
  return (host, props) => {
    if (host === null || host === undefined) return;
    for (const key of attachmentKeys(props)) {
      attach(host, () => Reflect.get(props, key));
    }
  };
}

// For a component that delegates to another Symbiote component by naming individual props
// instead of spreading (the list family, whose wrappers forward ~30 named props, and anything
// rebuilding its props through a plain string-keyed Record such as Animated's `reduceProps`).
// Symbol keys do not survive either, so the wrapper re-spreads just the attachment ones.
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
