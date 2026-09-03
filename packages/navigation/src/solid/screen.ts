// Stack.Screen / Tab.Screen / Drawer.Screen: declarative markers that paint nothing. The navigator
// reads them through the context collector (screen-registry.ts) rather than by scanning children
// the way React and Vue can, then mounts the registered component itself.
//
// Every field is handed over as a GETTER over this component's own props, never a snapshot: a Solid
// component body runs ONCE, so `{ name: props.name }` would freeze the marker at its mount-time
// values and an app that swaps `options` on a live marker would silently keep the old header.
//
// The three live in one file because they differ only in which collector they call - three
// near-identical files would drift the way the two descriptor-shape guards did before they were
// lifted into @symbiote-native/components.
//
// Returning `undefined` (not an empty host element) is what keeps a marker free: Solid inserts
// nothing for it, and where a following sibling forces a position placeholder the renderer emits an
// engine ANCHOR, which the commit walk skips. Svelte needed a hidden zero-size host for its markers
// because its compiler turns the whitespace BETWEEN them into real text nodes; Solid's JSX drops
// that whitespace, so the hazard does not exist here.

import {
  collectDrawerScreen,
  collectStackScreen,
  collectTabScreen,
} from './screen-registry';
import type { IScreenProps } from './screen-props';
import type { ITabScreenProps } from './tab-screen-props';
import type { IDrawerScreenProps } from './drawer-screen-props';

export function Screen(props: IScreenProps): undefined {
  collectStackScreen({
    get name() {
      return props.name;
    },
    get component() {
      return props.component;
    },
    get options() {
      return props.options;
    },
    get initialParams() {
      return props.initialParams;
    },
  });
  return undefined;
}

export function TabScreen(props: ITabScreenProps): undefined {
  collectTabScreen({
    get name() {
      return props.name;
    },
    get component() {
      return props.component;
    },
    get options() {
      return props.options;
    },
    get initialParams() {
      return props.initialParams;
    },
  });
  return undefined;
}

export function DrawerScreen(props: IDrawerScreenProps): undefined {
  collectDrawerScreen({
    get name() {
      return props.name;
    },
    get component() {
      return props.component;
    },
    get options() {
      return props.options;
    },
    get initialParams() {
      return props.initialParams;
    },
  });
  return undefined;
}
