// Drawer, the Solid lifecycle half: a signal for the router and getter props for live options
// The router, swipe math and imperative handle live in core, shared with every other adapter
// `drawerContent` takes an ACCESSOR, called once and untracked: solid-descriptor-bridge rules §4

import { createComponent, createMemo } from 'solid-js';
import type { Accessor } from 'solid-js';
import { Animated, createWindowDimensions } from '@symbiote-native/solid';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import { createDrawerController, createEmitterStore } from '../../core';
import type {
  IDrawerDescriptorMap,
  IDrawerNavigatorHandle,
  IDrawerOptions,
  IDrawerRouterState,
} from '../../core';
import { useNavigationScope } from '../navigation-context';
import {
  ScreenCollectorProvider,
  createScreenSignal,
  toRegistry,
} from '../screen-registry';
import { DrawerScreen } from '../screen';
import type { IDrawerScreenProps } from '../drawer-screen-props';
import { createDrawerScreens } from './drawer-screens';
import { createDrawerState } from './drawer-state';
import { createDrawerHost } from './drawer-view';

export type { IDrawerNavigatorHandle, IDrawerDescriptorMap } from '../../core';

// React's render PROP and Vue's scoped slot become a render prop over an ACCESSOR here
export type IDrawerContentSlotProps = {
  state: IDrawerRouterState;
  descriptors: IDrawerDescriptorMap;
  navigation: IDrawerNavigatorHandle;
};

export type IDrawerProps = IDrawerOptions & {
  initialRouteName?: string;
  drawerStyle?: IStyleProp<IViewStyle>;
  drawerContent?: (props: Accessor<IDrawerContentSlotProps>) => JSX.Element;
  ref?: (handle: IDrawerNavigatorHandle) => void;
  children?: JSX.Element;
};

let navigatorSequence = 0;

// Props are getters, so each read is live and the gesture callbacks built once need no mirror ref
function readOptions(props: IDrawerProps): IDrawerOptions {
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

function DrawerImpl(props: IDrawerProps): JSX.Element {
  const parentScope = useNavigationScope();
  const { screens, collector } = createScreenSignal<
    'drawer',
    IDrawerScreenProps['options']
  >('drawer');
  const registry = createMemo(() => toRegistry(screens()));
  navigatorSequence += 1;
  const { state, dispatch } = createDrawerState(
    registry,
    `drawer-${navigatorSequence}`,
    () => props.initialRouteName,
  );

  const windowDimensions = createWindowDimensions();
  const { progress, handle, panResponder } = createDrawerController({
    animated: Animated,
    readState: state,
    dispatch,
    readOptions: () => readOptions(props),
    readWindowWidth: () => windowDimensions().width,
  });
  props.ref?.(handle);

  const { content, panel } = createDrawerScreens({
    state,
    registry,
    handle,
    emitterFor: createEmitterStore().emitterFor,
    parentScope,
    drawerContent: props.drawerContent,
  });

  const host = createDrawerHost({
    options: () => readOptions(props),
    overlayColor: () => props.overlayColor,
    drawerStyle: () => props.drawerStyle,
    isOpen: () => state().isOpen,
    closeDrawer: handle.closeDrawer,
    progress,
    panHandlers: panResponder.panHandlers,
    content,
    panel,
  });

  return createComponent(ScreenCollectorProvider, {
    value: collector,
    get children(): JSX.Element {
      return [props.children, host];
    },
  });
}

export const Drawer = Object.assign(DrawerImpl, { Screen: DrawerScreen });

// Gaps vs the real gesture-handler + reanimated drawer: no `configureGestureHandler`, no gesture
// relationships against nested scrollers, `progress` lives on the JS thread, and the status bar
// and keyboard options are unscoped
