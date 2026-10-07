// Drawer, the Vue lifecycle half: a shallow ref for the router and attrs read live at gesture time
// The router, swipe math and imperative handle live in core, shared with every other adapter
// The view is rebuilt as vnodes on every render, see drawer-view.ts

import { defineComponent, shallowRef, useId } from '@vue/runtime-core';
import {
  Animated,
  normalizeVueAttrs,
  useWindowDimensions,
} from '@symbiote-native/vue';
import { dlog } from '@symbiote-native/engine';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import {
  buildFixedRoutes,
  createDrawerController,
  createEmitterStore,
  createInitialDrawerRouterState,
  drawerRouterReducer,
} from '../../core';
import type {
  IDrawerDescriptorMap,
  IDrawerNavigatorHandle,
  IDrawerOptions,
  IDrawerRouterAction,
  IDrawerRouterState,
} from '../../core';
import { injectNavigationScope } from '../navigation-context';
import { DrawerScreen } from '../drawer-screen';
import { trackFocus } from '../track-focus';
import {
  asString,
  collectDrawerRegistry,
  isStyleProp,
  readDrawerOptions,
} from './drawer-attrs';
import { renderDrawerView } from './drawer-view';

export type { IDrawerNavigatorHandle, IDrawerDescriptorMap } from '../../core';

// React's `renderDrawerContent` render-PROP becomes a scoped SLOT here
export type IDrawerContentSlotProps = {
  state: IDrawerRouterState;
  descriptors: IDrawerDescriptorMap;
  navigation: IDrawerNavigatorHandle;
};

// React's `children` becomes the default slot (the registered screens) and its render prop the
// `drawerContent` scoped slot
export type IDrawerProps = IDrawerOptions & {
  initialRouteName?: string;
  drawerStyle?: IStyleProp<IViewStyle>;
};

const DrawerImpl = defineComponent<IDrawerProps>(
  (_props, { attrs: rawAttrs, slots, expose }) => {
    const attrs = normalizeVueAttrs(rawAttrs);
    // Read BEFORE this Drawer provides its own scope, as it becomes the `parent` of its screens
    const ambientScopeRef = injectNavigationScope();
    const readOptions = (): IDrawerOptions => readDrawerOptions(attrs);

    const initialRoutes = buildFixedRoutes(
      collectDrawerRegistry(slots.default?.() ?? []),
      useId(),
    );
    if (initialRoutes.length === 0)
      dlog('Drawer: no <Drawer.Screen> children registered');
    const state = shallowRef(
      createInitialDrawerRouterState(
        initialRoutes,
        asString(attrs.initialRouteName),
      ),
    );

    const windowDimensions = useWindowDimensions();
    const { progress, handle, panResponder } = createDrawerController({
      animated: Animated,
      readState: () => state.value,
      dispatch: (action: IDrawerRouterAction) => {
        state.value = drawerRouterReducer(state.value, action);
      },
      readOptions,
      readWindowWidth: () => windowDimensions.value.width,
    });
    expose(handle);

    const { emitterFor } = createEmitterStore();
    trackFocus(state, emitterFor, 'Drawer');

    return () => {
      const registry = collectDrawerRegistry(slots.default?.() ?? []);
      if (registry.size === 0)
        dlog('Drawer: no <Drawer.Screen> children registered');
      return renderDrawerView({
        registry,
        state: state.value,
        handle,
        options: readOptions(),
        drawerStyle: isStyleProp(attrs.drawerStyle)
          ? attrs.drawerStyle
          : undefined,
        progress,
        panHandlers: panResponder.panHandlers,
        parent: ambientScopeRef?.value,
        emitterFor,
        drawerContentSlot: slots.drawerContent,
      });
    };
  },
  { name: 'Drawer', inheritAttrs: false },
);

export const Drawer = Object.assign(DrawerImpl, { Screen: DrawerScreen });

// Gaps vs the real gesture-handler + reanimated drawer: no `configureGestureHandler`, no gesture
// relationships against nested scrollers, `progress` lives on the JS thread, and the status bar
// and keyboard options are unscoped
