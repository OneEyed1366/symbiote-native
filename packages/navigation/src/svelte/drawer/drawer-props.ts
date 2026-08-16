// Drawer's own public prop surface. Plain `.ts` for the tsc-cannot-see-a-`.svelte`-named-export
// reason ../screen-props.ts documents.

import type { Snippet } from 'svelte';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import type {
  IDrawerDescriptorMap,
  IDrawerNavigatorHandle,
  IDrawerOptions,
  IDrawerRouterState,
} from '../../core';

// React's `renderDrawerContent` render-PROP becomes a Snippet WITH A PARAMETER here (Vue's twin
// is a scoped slot) - the drawer panel's content is app-authored and needs the router state, the
// per-route options map, and the navigator handle to paint a menu.
export type IDrawerContentSlotProps = {
  state: IDrawerRouterState;
  descriptors: IDrawerDescriptorMap;
  navigation: IDrawerNavigatorHandle;
};

export type IDrawerProps = IDrawerOptions & {
  initialRouteName?: string;
  drawerStyle?: IStyleProp<IViewStyle>;
  // The `<Drawer.Screen>` markers.
  children?: Snippet;
  drawerContent?: Snippet<[IDrawerContentSlotProps]>;
};
