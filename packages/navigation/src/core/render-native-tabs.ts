// A whole native tab navigator as decisions: the host, one screen per route and the accessory
// An adapter creates the elements and renders each route content inside its screen element

import {
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_FOCUS,
} from './navigation-events';
import type { INavigationEmitter } from './navigation-events';
import { resolveNativeTabScreen } from './native-tab-screen';
import type {
  INativeTabScreen,
  INativeTabScreenOptions,
} from './native-tab-screen';
import type { INativeTabAction, INativeTabState } from './native-tab-state';
import { resolveNativeTabsHost } from './native-tabs-host';
import type {
  INativeTabsHost,
  INativeTabsHostOptions,
} from './native-tabs-host';
import { resolveTabsBottomAccessory } from './native-tabs-bottom-accessory';
import type {
  ITabsBottomAccessory,
  ITabsBottomAccessoryEnvironmentEvent,
} from './native-tabs-bottom-accessory';
import type { IRoute } from './tab-router-state';

export type INativeTabsViewHostOptions = Omit<
  INativeTabsHostOptions,
  'selectedScreenKey' | 'baseProvenance'
>;

export type INativeTabsViewScreenOptions = Omit<
  INativeTabScreenOptions,
  'screenKey'
>;

export type INativeTabsViewInput = {
  state: INativeTabState;
  dispatch: (action: INativeTabAction) => void;
  os: string;
  osVersion: string | number;
  host: INativeTabsViewHostOptions;
  screenOptionsOf: (route: IRoute<unknown>) => INativeTabsViewScreenOptions;
  emitterFor: (routeKey: string) => INavigationEmitter;
  hasBottomAccessory: boolean;
  onBottomAccessoryEnvironmentChange?: (
    event: ITabsBottomAccessoryEnvironmentEvent,
  ) => void;
};

export type INativeTabsView = {
  host: INativeTabsHost;
  screens: { route: IRoute<unknown>; screen: INativeTabScreen }[];
  bottomAccessory: ITabsBottomAccessory | undefined;
};

type IAcknowledgement = { selectedScreenKey: string; provenance: number };

// Both events carry the selection native keeps, so JS follows it before the app hears of it
function resolveHost(input: INativeTabsViewInput): INativeTabsHost {
  const { state, dispatch, host } = input;
  const acknowledge = (event: IAcknowledgement): void =>
    dispatch({
      type: 'nativeSelected',
      selectedScreenKey: event.selectedScreenKey,
      provenance: event.provenance,
    });
  return resolveNativeTabsHost(
    {
      ...host,
      selectedScreenKey: state.routes[state.index]?.key ?? '',
      baseProvenance: state.baseProvenance,
      onTabSelected: event => {
        acknowledge(event);
        host.onTabSelected?.(event);
      },
      onTabSelectionRejected: event => {
        acknowledge(event);
        host.onTabSelectionRejected?.(event);
      },
    },
    input.os,
  );
}

// Appear and disappear mark visibility after native switched, so they alone emit focus and blur
function resolveScreen(
  input: INativeTabsViewInput,
  route: IRoute<unknown>,
): INativeTabScreen {
  const options = input.screenOptionsOf(route);
  const emitter = input.emitterFor(route.key);
  return resolveNativeTabScreen(
    {
      ...options,
      screenKey: route.key,
      onDidAppear: () => {
        emitter.emit(NAVIGATION_EVENT_FOCUS);
        options.onDidAppear?.();
      },
      onDidDisappear: () => {
        emitter.emit(NAVIGATION_EVENT_BLUR);
        options.onDidDisappear?.();
      },
    },
    input.os,
  );
}

export function resolveNativeTabsView(
  input: INativeTabsViewInput,
): INativeTabsView {
  return {
    host: resolveHost(input),
    screens: input.state.routes.map(route => ({
      route,
      screen: resolveScreen(input, route),
    })),
    bottomAccessory: resolveTabsBottomAccessory({
      os: input.os,
      osVersion: input.osVersion,
      hasAccessory: input.hasBottomAccessory,
      onEnvironmentChange: input.onBottomAccessoryEnvironmentChange,
    }),
  };
}
