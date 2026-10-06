// Stack, the Vue lifecycle half. The route-stack transitions (navigator-state) and the
// options/props folds (screen-options, render-stack) live in @symbiote-native/navigation core,
// shared verbatim with the React/Angular adapters; here Vue supplies the lifecycle - a plain ref
// for the pushed-route stack (Vue's twin of useReducer: reassign `.value` from the same pure
// reducer), useId + a closure counter for route-key generation, expose() for the push/pop/replace
// navigator handle - plus the descriptor bridge for the header config leaf. Pushing/popping a
// route is an ordinary child mount/unmount: RNSScreenStack diffs its RNSScreen children natively,
// so no imperative native command is needed here at all. Neither this nor the Screen marker
// imports react-native-screens' own React components (ScreenStack.tsx et al - hooks, crashes a
// non-React adapter); the native views are driven directly through the ViewConfig ../register
// registers. See CLAUDE.md <third_party_rn_packages_are_react_only>.

import { defineComponent, shallowRef, useId } from '@vue/runtime-core';
import type { VNode } from '@vue/runtime-core';
import { normalizeVueAttrs } from '@symbiote-native/vue';
import {
  buildInitialState,
  createEmitterStore,
  createRouteFactory,
  createStackHandle,
  isRecord,
  navigatorReducer,
  reconcileStackRoutes,
} from '../../core';
import type { INavigatorAction, INavigatorState } from '../../core';
import { collectScreenVnodes } from '../collect-screen-vnodes';
import { injectNavigationScope } from '../navigation-context';
import { Screen } from '../screen';
import type { IScreenProps, IVueScreenOptions } from '../screen';
import { renderStack } from './route-screen';
import type { IScreenRegistryEntry } from './route-screen';

export type { INavigatorHandle } from '../../core';

// React's `children?: ReactNode` becomes Vue's default slot instead (registered screens, read via
// collectRegistry below) - same split Modal's IModalProps documents.
export type IStackProps = {
  initialRouteName?: string;
  screenOptions?: IVueScreenOptions;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asComponent(value: unknown): IScreenProps['component'] | undefined {
  if (typeof value === 'function') return value as IScreenProps['component'];
  return isRecord(value) ? (value as IScreenProps['component']) : undefined;
}

// Narrows only the object-ness: the ~20 optional fields go wholesale into the core resolvers,
// and a per-field guard would just redo what TypeScript already checks structurally
function asScreenOptions(value: unknown): IVueScreenOptions | undefined {
  return isRecord(value) ? (value as IVueScreenOptions) : undefined;
}

function asScreenOptionsOrResolver(value: unknown): IScreenProps['options'] {
  if (typeof value === 'function') return value as IScreenProps['options'];
  return asScreenOptions(value);
}

function collectRegistry(
  vnodes: readonly VNode[],
  registry = new Map<string, IScreenRegistryEntry>(),
): Map<string, IScreenRegistryEntry> {
  for (const vnode of collectScreenVnodes(vnodes, Screen)) {
    if (!isRecord(vnode.props)) continue;
    const name = asString(vnode.props.name);
    const component = asComponent(vnode.props.component);
    if (name === undefined || component === undefined) continue;
    registry.set(name, {
      component,
      options: asScreenOptionsOrResolver(vnode.props.options),
      initialParams: vnode.props.initialParams,
    });
  }
  return registry;
}

const StackImpl = defineComponent<IStackProps>(
  (_props, { attrs: rawAttrs, slots, expose }) => {
    const attrs = normalizeVueAttrs(rawAttrs);

    // Read BEFORE this Stack provides its own per-screen scope: it becomes the `parent` link that
    // `getParent()` walks, and stays the injected ref so each render reads its CURRENT `.value`
    const ambientScopeRef = injectNavigationScope();

    const routeIdPrefix = useId();
    const createRoute = createRouteFactory(routeIdPrefix);
    const { emitterFor, broadcastState } = createEmitterStore();
    const loggedPropKeys = new Set<string>();

    const initialRegistry = collectRegistry(slots.default?.() ?? []);
    const state = shallowRef(
      buildInitialState(
        initialRegistry,
        asString(attrs.initialRouteName),
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

    return () => {
      const registry = collectRegistry(slots.default?.() ?? []);
      registeredNames = [...registry.keys()];
      const current = currentState();
      broadcastState(current);
      return renderStack({
        registry,
        current,
        screenOptions: asScreenOptions(attrs.screenOptions),
        navigation: handle,
        parent: ambientScopeRef?.value,
        emitterFor,
        onPop: () => dispatch({ type: 'pop', count: 1 }),
        loggedPropKeys,
      });
    };
  },
  { name: 'Stack', inheritAttrs: false },
);

export const Stack = Object.assign(StackImpl, { Screen });
