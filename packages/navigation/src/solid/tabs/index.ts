// Tab, the Solid lifecycle half: a signal for the router and a bar rebuilt only on a shape change
// The router and the bar's descriptor live in core, shared with every other adapter
// Only the focused screen is mounted: solid-descriptor-bridge rules §5 (see ../focused-content.ts)

import { createComponent, createMemo } from 'solid-js';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import { createEmitterStore } from '../../core';
import type { ITabNavigatorHandle, ITabOptions } from '../../core';
import { createFocusedContent, createFocusedKey } from '../focused-content';
import { useNavigationScope } from '../navigation-context';
import {
  ScreenCollectorProvider,
  createScreenSignal,
  toRegistry,
} from '../screen-registry';
import { TabScreen } from '../screen';
import type { ITabScreenProps } from '../tab-screen-props';
import { trackFocus } from '../track-focus';
import { createTabState } from './tab-state';
import { createTabRoot } from './tab-view';

export type { ITabNavigatorHandle } from '../../core';

export type ITabProps = {
  initialRouteName?: string;
  screenOptions?: ITabOptions;
  ref?: (handle: ITabNavigatorHandle) => void;
  children?: JSX.Element;
};

let navigatorSequence = 0;

function TabImpl(props: ITabProps): JSX.Element {
  // Read BEFORE this Tab provides its own scope, as it becomes the `parent` of its screens
  const parentScope = useNavigationScope();
  const { screens, collector } = createScreenSignal<
    'tab',
    ITabScreenProps['options']
  >('tab');
  const registry = createMemo(() => toRegistry(screens()));
  navigatorSequence += 1;
  const { state, handle } = createTabState(
    registry,
    `tab-${navigatorSequence}`,
    () => props.initialRouteName,
  );
  props.ref?.(handle);

  const { emitterFor } = createEmitterStore();
  const focusedKey = createFocusedKey(state);
  trackFocus(focusedKey, emitterFor, 'Tab');
  const content = createFocusedContent(
    {
      state,
      componentOf: name => registry().get(name)?.component,
      navigation: handle,
      emitterFor,
      parentScope,
    },
    focusedKey,
  );
  const root = createTabRoot({
    state,
    registry,
    handle,
    screenOptions: () => props.screenOptions,
    content,
  });

  return createComponent(ScreenCollectorProvider, {
    value: collector,
    get children(): JSX.Element {
      return [props.children, root];
    },
  });
}

export const Tab = Object.assign(TabImpl, { Screen: TabScreen });
