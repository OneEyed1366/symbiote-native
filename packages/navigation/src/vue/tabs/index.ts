// Tab, the Vue lifecycle half: a shallow ref for the dispatched state, reconciled in each render
// The router and the bar's descriptor live in core, shared with every other adapter
// Slot vnodes are not reactive state, so only the render can see a screen appear or disappear

import {
  defineComponent,
  nextTick,
  onUnmounted,
  shallowRef,
  useId,
} from '@vue/runtime-core';
import { normalizeVueAttrs } from '@symbiote-native/vue';
import { dlog } from '@symbiote-native/engine';
import {
  buildFixedRoutes,
  createEmitterStore,
  createFocusTracker,
  createInitialTabState,
  createTabHandle,
  reconcileTabRoutes,
  tabRouterReducer,
} from '../../core';
import type {
  IRoute,
  ITabOptions,
  ITabRouterAction,
  ITabRouterState,
} from '../../core';
import { injectNavigationScope } from '../navigation-context';
import { TabScreen } from '../tab-screen';
import { asString, collectTabRegistry, isTabOptions } from './tab-attrs';
import { renderTabView } from './tab-view';

export type { ITabNavigatorHandle } from '../../core';

// React's `children` becomes the default slot, where the registered screens are read from
export type ITabProps = {
  initialRouteName?: string;
  screenOptions?: ITabOptions;
};

const TabImpl = defineComponent<ITabProps>(
  (_props, { attrs: rawAttrs, slots, expose }) => {
    const attrs = normalizeVueAttrs(rawAttrs);
    // Read BEFORE this Tab provides its own scope, as it becomes the `parent` of its screens
    const ambientScopeRef = injectNavigationScope();
    const routeIdPrefix = useId();

    // `null` means nothing was dispatched, which keeps `initialRouteName` honored when the
    // markers arrive after the first render. The state is reconciled against the slot's routes in
    // the render and never written back, as a state write inside a derivation is an error in Vue
    const dispatchedState = shallowRef<ITabRouterState | null>(null);
    // The routes the last render derived: `dispatch` must reduce over the list that paint used
    let latestRoutes: readonly IRoute<unknown>[] = buildFixedRoutes(
      collectTabRegistry(slots.default?.() ?? []),
      routeIdPrefix,
    );
    if (latestRoutes.length === 0)
      dlog('Tab: no <Tab.Screen> children registered');

    function resolveState(routes: readonly IRoute<unknown>[]): ITabRouterState {
      const dispatched = dispatchedState.value;
      return dispatched === null
        ? createInitialTabState(routes, asString(attrs.initialRouteName))
        : reconcileTabRoutes(dispatched, routes);
    }

    function dispatch(action: ITabRouterAction): void {
      dispatchedState.value = tabRouterReducer(
        resolveState(latestRoutes),
        action,
      );
    }

    const handle = createTabHandle(dispatch);
    expose(handle);

    // A stable emitter per route key, so its identity cannot race Vue's render and mount cycle
    const { emitterFor } = createEmitterStore();
    // Driven from the render, as the focused key follows the slot's route list too. The emit waits
    // for `nextTick`, which resolves after the new screen's `onMounted` has subscribed
    const tracker = createFocusTracker(emitterFor, 'Tab', nextTick);
    onUnmounted(() => tracker.dispose());

    return () => {
      const registry = collectTabRegistry(slots.default?.() ?? []);
      if (registry.size === 0) dlog('Tab: no <Tab.Screen> children registered');
      latestRoutes = buildFixedRoutes(registry, routeIdPrefix);
      const state = resolveState(latestRoutes);
      tracker.update(state.routes[state.index]?.key);
      const screenOptions = isTabOptions(attrs.screenOptions)
        ? attrs.screenOptions
        : undefined;
      return renderTabView({
        registry,
        state,
        handle,
        screenOptions,
        parent: ambientScopeRef?.value,
        emitterFor,
      });
    };
  },
  { name: 'Tab', inheritAttrs: false },
);

export const Tab = Object.assign(TabImpl, { Screen: TabScreen });
