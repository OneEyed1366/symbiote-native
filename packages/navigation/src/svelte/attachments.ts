// Svelte attachments (`{@attach ...}`) for the react-native-screens native leaves.
//
// Every react-native-screens Fabric view name is capitalized and un-hyphenated (`RNSScreen`,
// `RNSScreenStack`, `RNSSearchBar`), so a literal `<RNSScreen>` in a template is a component
// reference, not an element, as for the `RNCSlider` leaf of `@symbiote-native/slider`

// Slider mounts its leaf through the Descriptor bridge, as the leaf has no live framework children
// A stack screen has them (`RNSScreenContentWrapper`), so the bridge is not an option here
//
// The way through is `<svelte:element this={'RNSScreen'}>`: it creates the element from a plain
// runtime string the compiler never inspects, and it accepts ordinary framework children

// Its one catch is that a dynamic tag compiles through the generic attribute codegen, so
// writing `p={bag}` as an attribute on it silently fails
// An attachment bypasses that: it gets the raw element and re-runs on a props change

import { isSymbioteNode } from '@symbiote-native/engine';
import { buildSearchBarHandle } from '../core';
import type { ISearchBarCommands } from '../core';

// The object-bag prop set, the same entry point every adapter's props go through
export { hostProps } from '@symbiote-native/svelte/native-view-bridge';

// The Svelte twin of Angular's `SearchBarRefDirective` and the callback `ref` of React and Vue
// It fills the app-supplied cell once the native node exists and clears it on teardown
// `buildSearchBarHandle` reads the node lazily, so handing it over before a commit is safe
export function searchBarRef(
  ref: { current: ISearchBarCommands | null } | undefined,
): (node: unknown) => (() => void) | void {
  return node => {
    if (ref === undefined) return;
    if (!isSymbioteNode(node)) {
      ref.current = null;
      return;
    }
    ref.current = buildSearchBarHandle(() => node);
    return () => {
      ref.current = null;
    };
  };
}
