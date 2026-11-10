// Vue lifecycle half of `Stack`, route transitions and option folds live in core
// A push or pop is a plain child mount, `RNSScreenStack` diffs its children natively
// The library's own React components are never imported, `../register` supplies the ViewConfig

import { defineComponent, shallowRef, useId } from '@vue/runtime-core';
import type { VNode } from '@vue/runtime-core';
import { normalizeVueAttrs } from '@symbiote-native/vue';
import {
  buildInitialState,
  createEmitterStore,
  createRouteFactory,
  createStackHandle,
  createTransitionProgressStore,
  isRecord,
  navigatorReducer,
  reconcileStackRoutes,
} from '../../core';
import type {
  INativeContainerStyle,
  INavigatorAction,
  INavigatorState,
} from '../../core';
import { collectScreenRegistry } from '../collect-registry';
import { injectNavigationScope } from '../navigation-context';
import { Screen } from '../screen';
import type { IScreenProps, IVueScreenOptions } from '../screen';
import { renderStack } from './route-screen';
import type { IScreenRegistryEntry } from './route-screen';

export type { INavigatorHandle } from '../../core';

// React's `children` is the default slot here, its screens read by `collectScreenRegistry`
export type IStackProps = {
  initialRouteName?: string;
  screenOptions?: IVueScreenOptions;
  nativeContainerStyle?: INativeContainerStyle;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

// Narrows only the object-ness: the ~20 optional fields go wholesale into the core resolvers,
// and a per-field guard would just redo what TypeScript already checks structurally
function asScreenOptions(value: unknown): IVueScreenOptions | undefined {
  return isRecord(value) ? value : undefined;
}

function collectRegistry(
  vnodes: readonly VNode[],
): Map<string, IScreenRegistryEntry> {
  return collectScreenRegistry<
    IScreenProps['component'],
    NonNullable<IScreenProps['options']>
  >(vnodes, Screen);
}

const StackImpl = defineComponent<IStackProps>(
  (_props, { attrs: rawAttrs, slots, expose }) => {
    // Folded per call, as a copy taken once in setup would freeze every option at mount
    const readAttrs = () => normalizeVueAttrs(rawAttrs);

    const routeIdPrefix = useId();
    const createRoute = createRouteFactory(routeIdPrefix);
    const { emitterFor, broadcastState } = createEmitterStore();

    const initialRegistry = collectRegistry(slots.default?.() ?? []);
    const state = shallowRef(
      buildInitialState(
        initialRegistry,
        asString(readAttrs().initialRouteName),
        routeIdPrefix,
        createRoute,
      ),
    );

    // The names last seen in the slot, a plain cache and not a ref: writing a ref from inside the
    // render closure would re-trigger the render effect that produced it
    let registeredNames: readonly string[] = [];

    // A `<Stack.Screen>` marker can leave the slot while its route is still in the history, so
    // the repair happens on READ and `dispatch` then persists it for the next push
    function currentState(): INavigatorState {
      return reconcileStackRoutes(state.value, registeredNames);
    }

    function dispatch(action: INavigatorAction): void {
      state.value = navigatorReducer(currentState(), action);
    }

    const handle = createStackHandle(
      dispatch,
      createRoute,
      () => currentState().routes.length > 1,
    );
    expose(handle);

    // Read BEFORE this Stack provides its own per-screen scope: it becomes the `parent` link that
    // `getParent()` walks, and stays the injected ref so each render reads its CURRENT `.value`
    const ambientScopeRef = injectNavigationScope();
    const loggedPropKeys = new Set<string>();
    const transitionProgress = createTransitionProgressStore();

    return () => {
      const registry = collectRegistry(slots.default?.() ?? []);
      registeredNames = [...registry.keys()];
      const current = currentState();
      broadcastState(current);
      const attrs = readAttrs();
      return renderStack({
        registry,
        current,
        screenOptions: asScreenOptions(attrs.screenOptions),
        navigation: handle,
        parent: ambientScopeRef?.value,
        emitterFor,
        onPop: () => dispatch({ type: 'pop', count: 1 }),
        loggedPropKeys,
        transitionProgress,
        nativeContainerStyle: attrs.nativeContainerStyle,
      });
    };
  },
  { name: 'Stack', inheritAttrs: false },
);

export const Stack = Object.assign(StackImpl, { Screen });
