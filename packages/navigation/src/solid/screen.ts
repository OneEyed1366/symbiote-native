// Stack.Screen / Tab.Screen / Drawer.Screen: declarative markers that paint nothing. The navigator
// reads them through the context collector (screen-registry.ts) rather than by scanning children
// the way React and Vue can, then mounts the registered component itself.
//
// Every field is handed over as a GETTER over this component's own props, never a snapshot: a Solid
// component body runs ONCE, so `{ name: props.name }` would freeze the marker at its mount-time
// values and an app that swaps `options` on a live marker would silently keep the old header.
//
// The four markers share one file, as they differ only in the kind they name
//
// Returning `undefined` makes Solid insert nothing, and a placeholder anchor is skipped by the walk

import type { Component } from 'solid-js';
import { collectScreen } from './screen-registry';
import type { IRegisteredScreen } from './screen-registry';
import type { IScreenProps } from './screen-props';
import type { ITabScreenProps } from './tab-screen-props';
import type { IDrawerScreenProps } from './drawer-screen-props';
import type { INativeTabScreenProps } from './native-tab-screen-props';

type IMarkerProps<TOptions> = {
  name: string;
  component: Component;
  options?: TOptions;
  initialParams?: unknown;
};

function liveScreen<TOptions>(
  props: IMarkerProps<TOptions>,
): IRegisteredScreen<TOptions | undefined> {
  return {
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
  };
}

export function Screen(props: IScreenProps): undefined {
  collectScreen('stack', liveScreen(props));
  return undefined;
}

export function TabScreen(props: ITabScreenProps): undefined {
  collectScreen('tab', liveScreen(props));
  return undefined;
}

export function DrawerScreen(props: IDrawerScreenProps): undefined {
  collectScreen('drawer', liveScreen(props));
  return undefined;
}

export function NativeTabScreen(props: INativeTabScreenProps): undefined {
  collectScreen('nativeTab', liveScreen(props));
  return undefined;
}
