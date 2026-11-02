// NativeTab, the React lifecycle half: a stored state reconciled in render, native reports into it
// The host, screen and accessory decisions live in core, shared with every other adapter

import {
  forwardRef,
  useContext,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
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
import { collectRegistry } from '../collect-registry';
import { NativeTabScreen } from '../native-tab-screen';
import type { INativeTabScreenProps } from '../native-tab-screen';
import { NavigationContext } from '../navigation-context';
import { screenElementGuard } from '../screen-element-guard';
import { useFixedRouteState } from '../use-fixed-route-state';
import { renderNativeTabs } from './native-tab-view';
import type { INativeTabAccessoryFactory } from './native-tab-view';

export type INativeTabNavigatorHandle = ITabNavigatorHandle;

export type INativeTabProps = Omit<INativeTabsViewHostOptions, 'ios'> & {
  ios?: INativeTabsHostIOS & { bottomAccessory?: INativeTabAccessoryFactory };
  initialRouteName?: string;
  screenOptions?: INativeTabsViewScreenOptions;
  children?: ReactNode;
};

const isNativeTabScreenElement =
  screenElementGuard<INativeTabScreenProps>(NativeTabScreen);

const NATIVE_TAB_ROUTER = {
  create: createInitialNativeTabState,
  reconcile: reconcileNativeTabRoutes,
  reduce: nativeTabReducer,
};

const NativeTabImpl = forwardRef<INativeTabNavigatorHandle, INativeTabProps>(
  (props, forwardedRef) => {
    const { initialRouteName, screenOptions, children, ios, ...hostOptions } =
      props;
    const { bottomAccessory, ...iosHostOptions } = ios ?? {};
    // Read BEFORE NativeTab provides its context, as it becomes the `parent` of its screens
    const ambientContext = useContext(NavigationContext);
    const registry = useMemo(
      () => collectRegistry(children, isNativeTabScreenElement),
      [children],
    );
    const [{ emitterFor }] = useState(createEmitterStore);
    const { state, dispatch } = useFixedRouteState(
      registry,
      initialRouteName,
      NATIVE_TAB_ROUTER,
      'NativeTab: no <NativeTab.Screen> children registered',
    );
    const handle = useMemo(() => createTabHandle(dispatch), [dispatch]);
    useImperativeHandle(forwardedRef, () => handle, [handle]);

    return renderNativeTabs({
      registry,
      state,
      dispatch,
      handle,
      host: { ...hostOptions, ios: iosHostOptions },
      screenOptions,
      bottomAccessory,
      parent: ambientContext,
      emitterFor,
    });
  },
);

export const NativeTab = Object.assign(NativeTabImpl, {
  Screen: NativeTabScreen,
});
