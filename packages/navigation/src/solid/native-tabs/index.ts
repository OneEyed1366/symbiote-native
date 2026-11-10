// NativeTab, the Solid lifecycle half: a signal for the router, native reports dispatch into it
// The host, screen and accessory decisions live in core, shared with every other adapter

import { createComponent, createMemo, splitProps } from 'solid-js';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import {
  createEmitterStore,
  createInitialNativeTabState,
  nativeTabReducer,
  reconcileNativeTabRoutes,
} from '../../core';
import type {
  INativeTabsHostIOS,
  INativeTabsViewHostOptions,
  INativeTabsViewScreenOptions,
  ITabNavigatorHandle,
} from '../../core';
import { createTabHandle } from '../../core/tab-handle';
import { createFixedRouterState } from '../fixed-router-state';
import { useNavigationScope } from '../navigation-context';
import { NativeTabScreen } from '../screen';
import {
  ScreenCollectorProvider,
  createScreenSignal,
  toRegistry,
} from '../screen-registry';
import type { INativeTabScreenProps } from '../native-tab-screen-props';
import { createNativeTabRoot } from './native-tab-view';
import type { INativeTabAccessoryRenderer } from './native-tab-view';

export type INativeTabNavigatorHandle = ITabNavigatorHandle;

export type INativeTabProps = Omit<INativeTabsViewHostOptions, 'ios'> & {
  ios?: INativeTabsHostIOS & { bottomAccessory?: INativeTabAccessoryRenderer };
  initialRouteName?: string;
  screenOptions?: INativeTabsViewScreenOptions;
  ref?: (handle: INativeTabNavigatorHandle) => void;
  children?: JSX.Element;
};

let navigatorSequence = 0;

// The accessory is a function the view calls, so it must not reach the native host props
function splitIos(ios: INativeTabProps['ios']) {
  const { bottomAccessory, ...host } = ios ?? {};
  return { bottomAccessory, host };
}

function NativeTabImpl(props: INativeTabProps): JSX.Element {
  // Read BEFORE this NativeTab provides its own scope, as it becomes the `parent` of its screens
  const parentScope = useNavigationScope();
  const [own, rest] = splitProps(props, [
    'initialRouteName',
    'screenOptions',
    'ref',
    'children',
  ]);
  const { screens, collector } = createScreenSignal<
    'nativeTab',
    INativeTabScreenProps['options']
  >('nativeTab');
  const registry = createMemo(() => toRegistry(screens()));
  navigatorSequence += 1;
  const { state, dispatch } = createFixedRouterState({
    registry,
    routeIdPrefix: `native-tab-${navigatorSequence}`,
    createInitial: routes =>
      createInitialNativeTabState(routes, own.initialRouteName),
    reconcile: reconcileNativeTabRoutes,
    reducer: nativeTabReducer,
  });
  const handle = createTabHandle(dispatch);
  own.ref?.(handle);

  const [iosProp, hostProps] = splitProps(rest, ['ios']);
  const ios = createMemo(() => splitIos(iosProp.ios));
  const root = createNativeTabRoot({
    state,
    dispatch,
    registry,
    handle,
    host: () => ({ ...hostProps, ios: ios().host }),
    screenOptions: () => own.screenOptions,
    bottomAccessory: () => ios().bottomAccessory,
    parentScope,
    emitterFor: createEmitterStore().emitterFor,
  });

  return createComponent(ScreenCollectorProvider, {
    value: collector,
    get children(): JSX.Element {
      return [own.children, root];
    },
  });
}

export const NativeTab = Object.assign(NativeTabImpl, {
  Screen: NativeTabScreen,
});
