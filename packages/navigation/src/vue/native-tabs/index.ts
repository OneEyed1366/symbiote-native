// NativeTab, the Vue lifecycle half: a stored state reconciled in each render
// The host, screen and accessory decisions live in core, shared with every other adapter

import { defineComponent, useId } from '@vue/runtime-core';
import { normalizeVueAttrs } from '@symbiote-native/vue';
import { dlog } from '@symbiote-native/engine';
import {
  buildFixedRoutes,
  createEmitterStore,
  createInitialNativeTabState,
  nativeTabReducer,
  reconcileNativeTabRoutes,
} from '../../core';
import type {
  INativeTabsViewHostOptions,
  INativeTabsViewScreenOptions,
  ITabNavigatorHandle,
} from '../../core';
import { createTabHandle } from '../../core/tab-handle';
import { collectScreenRegistry } from '../collect-registry';
import { createFixedRouteState } from '../fixed-route-state';
import { NativeTabScreen } from '../native-tab-screen';
import type { INativeTabScreenProps } from '../native-tab-screen';
import { injectNavigationScope } from '../navigation-context';
import { readNativeTabAttrs } from './native-tab-attrs';
import { renderNativeTabs } from './native-tab-view';

export type INativeTabNavigatorHandle = ITabNavigatorHandle;

// React's `children` becomes the default slot, the accessory is the `bottomAccessory` scoped slot
export type INativeTabProps = INativeTabsViewHostOptions & {
  initialRouteName?: string;
  screenOptions?: INativeTabsViewScreenOptions;
};

const NATIVE_TAB_ROUTER = {
  create: createInitialNativeTabState,
  reconcile: reconcileNativeTabRoutes,
  reduce: nativeTabReducer,
};

const NativeTabImpl = defineComponent<INativeTabProps>(
  (_props, { attrs: rawAttrs, slots, expose }) => {
    // Folded per call, as a copy taken once in setup would freeze every host option at mount
    const readAttrs = () => readNativeTabAttrs(normalizeVueAttrs(rawAttrs));
    const routeIdPrefix = useId();
    const readRegistry = () =>
      collectScreenRegistry<
        INativeTabScreenProps['component'],
        NonNullable<INativeTabScreenProps['options']>
      >(slots.default?.() ?? [], NativeTabScreen);

    const routeState = createFixedRouteState(
      NATIVE_TAB_ROUTER,
      () => readAttrs().initialRouteName,
      buildFixedRoutes(readRegistry(), routeIdPrefix),
    );
    const handle = createTabHandle(routeState.applyAction);
    expose(handle);
    // A stable emitter per route key, so its identity cannot race Vue's render and mount cycle
    const { emitterFor } = createEmitterStore();
    // NativeTab never provides a scope itself, its ambient one becomes the `parent` of its screens
    const ambientScopeRef = injectNavigationScope();

    return () => {
      const registry = readRegistry();
      if (registry.size === 0)
        dlog('NativeTab: no <NativeTab.Screen> children registered');
      const state = routeState.resolve(
        buildFixedRoutes(registry, routeIdPrefix),
      );
      const { screenOptions, host } = readAttrs();
      return renderNativeTabs({
        registry,
        state,
        dispatch: routeState.applyAction,
        handle,
        host,
        screenOptions,
        bottomAccessory: slots.bottomAccessory
          ? environment => slots.bottomAccessory?.({ environment })
          : undefined,
        parent: ambientScopeRef?.value,
        emitterFor,
      });
    };
  },
  { name: 'NativeTab', inheritAttrs: false },
);

export const NativeTab = Object.assign(NativeTabImpl, {
  Screen: NativeTabScreen,
});
