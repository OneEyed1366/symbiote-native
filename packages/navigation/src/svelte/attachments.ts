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
// The way through is `<svelte:element this={'RNSScreen'}>`: it creates the element via
// `document.createElement(tag)` with a plain runtime string the compiler never inspects, and it
// accepts ordinary framework children. Its one catch is documented in svelte-adapter-dom-shim
// skill §15 - a dynamic tag compiles through Svelte's generic setAttribute/property-diffing
// codegen, NOT the custom-element `p=` property-SET path, so writing `p={bag}` as an ATTRIBUTE on
// it silently fails. An attachment bypasses that entirely: it is handed the raw element and
// assigns the property from plain JS, then re-runs whenever the props it read change. Verified
// against the real compiler + the real shim before this was built on.

import { dlog, isSymbioteNode } from '@symbiote-native/engine';
import type { ShimElement } from '@symbiote-native/svelte/native-view-bridge';
import { buildSearchBarHandle } from '../core';
import type { ISearchBarCommands } from '../core';

// `unknown` rather than `Element`: the value Svelte hands an attachment is one of the DOM shim's
// own element classes, not a real DOM Element, and a function accepting `unknown` is still
// assignable everywhere Svelte expects `(element: Element) => ...`.
function isShimElement(value: unknown): value is ShimElement {
  return typeof value === 'object' && value !== null && 'engineNode' in value;
}

// The object-bag prop set, the same entry point every adapter's props go through (routeProp).
// Re-runs on every change of `props`, and the shim's own `p` setter diffs per key from there.
export function hostProps(
  props: Record<string, unknown>,
): (node: unknown) => void {
  return node => {
    if (!isShimElement(node)) {
      dlog('navigation: hostProps attached to a non-shim element, ignored');
      return;
    }
    node.p = props;
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
    if (!isShimElement(node)) {
      ref.current = null;
      return;
    }
    const engineNode = node.engineNode;
    if (!isSymbioteNode(engineNode)) {
      dlog('navigation: search bar attachment ran before the shim went live');
      ref.current = null;
      return;
    }
    ref.current = buildSearchBarHandle(() => engineNode);
    return () => {
      ref.current = null;
    };
  };
}
