// Tab, the React lifecycle half: a stored state reconciled in render, a fresh emitter per focus
// The router and the bar's descriptor live in core, shared with every other adapter

import { forwardRef, useContext, useImperativeHandle, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { ITabNavigatorHandle, ITabOptions } from '../../core';
import { collectRegistry } from '../collect-registry';
import { NavigationContext } from '../navigation-context';
import { screenElementGuard } from '../screen-element-guard';
import { TabScreen } from '../tab-screen';
import type { ITabScreenProps } from '../tab-screen';
import { useFocusedEmitter } from '../use-focused-emitter';
import { renderTabView } from './tab-view';
import { useTabState } from './use-tab-state';

export type { ITabNavigatorHandle } from '../../core';

export type ITabProps = {
  initialRouteName?: string;
  screenOptions?: ITabOptions;
  children?: ReactNode;
};

const isTabScreenElement = screenElementGuard<ITabScreenProps>(TabScreen);

const TabImpl = forwardRef<ITabNavigatorHandle, ITabProps>(
  (props, forwardedRef) => {
    // Read BEFORE this Tab provides its own context, as it becomes the `parent` of its screens
    const ambientContext = useContext(NavigationContext);
    const registry = useMemo(
      () => collectRegistry(props.children, isTabScreenElement),
      [props.children],
    );
    const { state, handle } = useTabState(registry, props.initialRouteName);
    useImperativeHandle(forwardedRef, () => handle, [handle]);
    const emitter = useFocusedEmitter(state.routes[state.index]?.key, 'Tab');

    return renderTabView({
      registry,
      state,
      handle,
      screenOptions: props.screenOptions,
      parent: ambientContext,
      emitter,
    });
  },
);

export const Tab = Object.assign(TabImpl, { Screen: TabScreen });
