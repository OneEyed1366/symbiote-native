// Drawer, the React lifecycle half: a reducer for the router and refs for the gesture's live reads
// The router, swipe math and imperative handle live in core, shared with every other adapter
// The view is rebuilt as elements on every render, see drawer-view.ts

import {
  forwardRef,
  useContext,
  useId,
  useImperativeHandle,
  useMemo,
  useReducer,
} from 'react';
import type { ReactNode } from 'react';
import { dlog } from '@symbiote-native/engine';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import {
  buildFixedRoutes,
  createInitialDrawerRouterState,
  drawerRouterReducer,
} from '../../core';
import type {
  IDrawerDescriptorMap,
  IDrawerNavigatorHandle,
  IDrawerOptions,
  IDrawerRouterState,
  IDrawerScreenOptions,
} from '../../core';
import { collectRegistry } from '../collect-registry';
import { NavigationContext } from '../navigation-context';
import { screenElementGuard } from '../screen-element-guard';
import { useFocusedEmitter } from '../use-focused-emitter';
import { DrawerScreen } from '../drawer-screen';
import type { IDrawerScreenProps } from '../drawer-screen';
import { renderDrawerView } from './drawer-view';
import { useDrawerController } from './use-drawer-controller';

export type { IDrawerNavigatorHandle, IDrawerDescriptorMap } from '../../core';

export type IDrawerProps = IDrawerOptions & {
  initialRouteName?: string;
  screenOptions?: IDrawerScreenOptions;
  drawerStyle?: IStyleProp<IViewStyle>;
  renderDrawerContent?: (props: {
    state: IDrawerRouterState;
    descriptors: IDrawerDescriptorMap;
    navigation: IDrawerNavigatorHandle;
  }) => ReactNode;
  children?: ReactNode;
};

const isDrawerScreenElement =
  screenElementGuard<IDrawerScreenProps>(DrawerScreen);

function pickOptions(props: IDrawerProps): IDrawerOptions {
  return {
    drawerType: props.drawerType,
    drawerPosition: props.drawerPosition,
    drawerWidth: props.drawerWidth,
    overlayColor: props.overlayColor,
    swipeEnabled: props.swipeEnabled,
    swipeEdgeWidth: props.swipeEdgeWidth,
    swipeMinDistance: props.swipeMinDistance,
    swipeMinVelocity: props.swipeMinVelocity,
  };
}

const DrawerImpl = forwardRef<IDrawerNavigatorHandle, IDrawerProps>(
  (props, forwardedRef) => {
    // Read BEFORE this Drawer provides its own context, as it becomes the `parent` of its screens
    const ambientContext = useContext(NavigationContext);
    const options = pickOptions(props);
    const registry = useMemo(
      () => collectRegistry(props.children, isDrawerScreenElement),
      [props.children],
    );
    const routeIdPrefix = useId();
    const routes = useMemo(
      () => buildFixedRoutes(registry, routeIdPrefix),
      [registry, routeIdPrefix],
    );
    const [state, dispatch] = useReducer(drawerRouterReducer, undefined, () =>
      createInitialDrawerRouterState(routes, props.initialRouteName),
    );
    if (routes.length === 0)
      dlog('Drawer: no <Drawer.Screen> children registered');

    const { progress, handle, panResponder } = useDrawerController(
      state,
      dispatch,
      options,
    );
    useImperativeHandle(forwardedRef, () => handle, [handle]);
    const emitter = useFocusedEmitter(state.routes[state.index]?.key, 'Drawer');

    return renderDrawerView({
      registry,
      state,
      handle,
      options,
      screenOptions: props.screenOptions,
      drawerStyle: props.drawerStyle,
      progress,
      panHandlers: panResponder.panHandlers,
      parent: ambientContext,
      emitter,
      renderDrawerContent: props.renderDrawerContent,
    });
  },
);

export const Drawer = Object.assign(DrawerImpl, { Screen: DrawerScreen });

// Gaps vs the real gesture-handler + reanimated drawer: no `configureGestureHandler`, no gesture
// relationships against nested scrollers, `progress` lives on the JS thread, and the status bar
// and keyboard options are unscoped
