// Svelte attachments (`{@attach ...}`) for the react-native-screens native leaves.
//
// WHY THESE EXIST AT ALL: every react-native-screens Fabric view name is capitalized and
// un-hyphenated (RNSScreen, RNSScreenStack, RNSScreenStackHeaderConfig, RNSSearchBar, ...), so a
// literal `<RNSScreen>` in a Svelte template parses as a COMPONENT reference, not an element -
// the same wall @symbiote-native/slider's 'RNCSlider' leaf hit. Slider sidestepped it by mounting
// the whole leaf through the Descriptor bridge, which works because that leaf carries no live
// framework children. A stack screen DOES (the app's own screen component lives inside
// RNSScreenContentWrapper), so the bridge is not an option here.
//
// The way through is `<svelte:element this={'RNSScreen'}>`: svelte-adapter-custom-renderer skill
// §7 confirms `<svelte:element>` is unaffected by the official custom-renderer compiler changes -
// still the only route to a capitalized, un-hyphenated runtime tag name. Under the official API
// every element (dynamic or literal) goes through the SAME ordinary per-prop attribute path
// (skill §5), so these attachments exist only because the callers (stack/index.svelte,
// stack-screen.svelte) drive props through `{@attach hostProps(...)}` rather than a `{...rest}`
// spread on the element. Nodes now arrive here EAGERLY bound - renderer.ts's `createElementNode`
// grafts the real, already-live node at creation time (skill §2) - so there is no more
// `.engineNode` indirection to unwrap; `node` handed to the attachment IS the real ISymbioteNode.

import { dlog, isSymbioteNode, routeProp } from '@symbiote-native/engine';
import { requestActiveCommit } from '@symbiote-native/svelte/renderer';
import { buildSearchBarHandle } from '../core';
import type { ISearchBarCommands } from '../core';

// The per-prop entry point every adapter's props go through (routeProp), forwarded key by key -
// the twin of descriptor-to-svelte.ts's `applyProps`. Re-runs on every change of `props`.
//
// This mutates the engine tree OUTSIDE renderer.ts's own setAttribute/insert/remove callbacks
// (the only ones that request a commit on their own) — an `{@attach}` runs in its own effect
// scope, not through the compiled template's per-key `attribute_effect`. Without an explicit
// `requestActiveCommit()`, a prop change that reaches Fabric ONLY through this path (no sibling
// mutation happening to piggyback a commit on) sits in `node.props` forever uncommitted — the
// same class of bug `descriptor-to-svelte.ts` had (svelte-adapter-custom-renderer skill §9/§10).
export function hostProps(props: Record<string, unknown>): (node: unknown) => void {
  return node => {
    if (!isSymbioteNode(node)) {
      dlog('navigation: hostProps attached to a non-Symbiote node, ignored');
      return;
    }
    for (const [key, value] of Object.entries(props)) routeProp(node, key, value);
    requestActiveCommit();
  };
}

// The Svelte twin of Angular's SearchBarRefDirective / React's and Vue's callback `ref` on the
// RNSSearchBar element: fills the app-supplied cell once the native node exists and clears it on
// teardown. buildSearchBarHandle's own getter is LAZY, so handing it the node here is safe even
// before the first commit.
export function searchBarRef(
  ref: { current: ISearchBarCommands | null } | undefined,
): (node: unknown) => (() => void) | void {
  return node => {
    if (ref === undefined) return;
    if (!isSymbioteNode(node)) {
      dlog('navigation: search bar attachment received a non-Symbiote node, ignored');
      ref.current = null;
      return;
    }
    const engineNode = node;
    ref.current = buildSearchBarHandle(() => engineNode);
    return () => {
      ref.current = null;
    };
  };
}
