// React lifecycle half of `Stack`, route transitions and option folds live in core
// A push or pop is a plain child mount, `RNSScreenStack` diffs its children natively
// The library's own React components are never imported, `../register` supplies the ViewConfig

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
  createTransitionProgressStore,
  navigatorReducer,
  reconcileStackRoutes,
} from '../../core';
import type { INativeContainerStyle, INavigatorHandle } from '../../core';
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
  nativeContainerStyle?: INativeContainerStyle;
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
    const [transitionProgress] = useState(createTransitionProgressStore);
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
      transitionProgress,
      nativeContainerStyle: props.nativeContainerStyle,
    });
  },
);

export const Stack = Object.assign(StackImpl, { Screen });
