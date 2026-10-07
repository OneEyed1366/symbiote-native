// Stack, the React lifecycle half. The route-stack transitions (navigator-state) and the
// options/props folds (screen-options, render-stack) live in @symbiote-native/navigation core,
// shared verbatim with the Vue/Angular adapters; here React supplies the lifecycle - useReducer
// for the pushed-route stack, useId + a ref counter for route-key generation, useImperativeHandle
// for the push/pop/replace navigator handle - plus the descriptor bridge for the header config
// leaf. Pushing/popping a route is an ordinary child mount/unmount: RNSScreenStack diffs its
// RNSScreen children natively, so no imperative native command is needed here at all. Neither
// this nor the Screen marker imports react-native-screens' own React components (ScreenStack.tsx
// et al - hooks, crashes a non-React adapter); the native views are driven directly through the
// ViewConfig ../register registers. See CLAUDE.md <third_party_rn_packages_are_react_only>.

import {
  forwardRef,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useReducer,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  buildInitialState,
  createEmitterStore,
  createRouteFactory,
  createStackHandle,
  navigatorReducer,
  reconcileStackRoutes,
} from '../../core';
import type { INavigatorHandle } from '../../core';
import { collectRegistry } from '../collect-registry';
import { NavigationContext } from '../navigation-context';
import { Screen } from '../screen';
import type { IReactScreenOptions, IScreenProps } from '../screen';
import { screenElementGuard } from '../screen-element-guard';
import { renderStack } from './route-screen';

export type { INavigatorHandle } from '../../core';

export type IStackProps = {
  initialRouteName?: string;
  screenOptions?: IReactScreenOptions;
  children?: ReactNode;
};

const isScreenElement = screenElementGuard<IScreenProps>(Screen);

const StackImpl = forwardRef<INavigatorHandle, IStackProps>(
  (props, forwardedRef) => {
    // Read BEFORE this Stack provides its own context: it becomes the `parent` link that
    // `getParent()` walks, and is undefined when this Stack is the nesting root
    const ambientContext = useContext(NavigationContext);
    const registry = useMemo(
      () => collectRegistry(props.children, isScreenElement),
      [props.children],
    );
    const routeIdPrefix = useId();
    const createRoute = useMemo(
      () => createRouteFactory(routeIdPrefix),
      [routeIdPrefix],
    );
    const [{ emitterFor, broadcastState }] = useState(createEmitterStore);
    const [loggedPropKeys] = useState(() => new Set<string>());
    const registeredNames = useMemo(() => [...registry.keys()], [registry]);

    const [dispatchedState, dispatch] = useReducer(
      navigatorReducer,
      undefined,
      () =>
        buildInitialState(
          registry,
          props.initialRouteName,
          routeIdPrefix,
          createRoute,
        ),
    );

    // A `<Stack.Screen>` marker can unregister while its route is still in the history. Reconciling
    // during render repairs the CURRENT paint (the call is pure and returns the same reference when
    // nothing changed), and the effect below only persists it for the next push
    const state = reconcileStackRoutes(dispatchedState, registeredNames);

    useEffect(() => {
      if (state !== dispatchedState) dispatch({ type: 'reset', state });
    }, [state, dispatchedState]);

    const routeCount = state.routes.length;
    const handle = useMemo(
      () => createStackHandle(dispatch, createRoute, () => routeCount > 1),
      [createRoute, routeCount],
    );

    useImperativeHandle(forwardedRef, () => handle, [handle]);

    // Broadcast in an effect, not mid-render: emitting would set a descendant's state while this
    // component is still rendering
    useEffect(() => broadcastState(state), [state, broadcastState]);

    return renderStack({
      registry,
      state,
      screenOptions: props.screenOptions,
      navigation: handle,
      parent: ambientContext,
      emitterFor,
      onPop: () => dispatch({ type: 'pop', count: 1 }),
      loggedPropKeys,
    });
  },
);

export const Stack = Object.assign(StackImpl, { Screen });
