// Framework-agnostic wiring of a stack screen's native events, search bar ref and debug output,
// so an adapter only supplies the lifecycle and the element creation

import {
  Platform,
  debugNodeId,
  dlog,
  isSymbioteNode,
} from '@symbiote-native/engine';
import type { ISymbioteNode } from '@symbiote-native/engine';
import {
  SCREEN_ON_APPEAR,
  SCREEN_ON_DISAPPEAR,
  SCREEN_ON_DISMISSED,
  SCREEN_ON_HEADER_BACK_BUTTON_CLICKED,
  SCREEN_ON_WILL_APPEAR,
  SCREEN_ON_WILL_DISAPPEAR,
  STACK_ON_FINISH_TRANSITIONING,
} from './constants';
import {
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_FOCUS,
} from './navigation-events';
import type { INavigationEmitter } from './navigation-events';
import type {
  INavigatorPlatform,
  IScreenOptions,
  ISearchBarOptions,
} from './navigator-props';
import { computeActivityState } from './navigator-state';
import {
  buildSearchBarPassthrough,
  resolveScreenRenderPlan,
  resolveStackProps,
} from './render-stack';
import type { IScreenRenderPlan } from './render-stack';
import { buildSearchBarHandle } from './search-bar-commands';
import type { ISearchBarCommands } from './search-bar-commands';

// `backTitleVisible` defaults to `true` on both platforms per the codegen spec's own default
const NAVIGATOR_PLATFORM: INavigatorPlatform = {
  defaultHeaderBackTitleVisible: true,
};

type IRouteRef = { key: string; name: string };

export type IStackRoutePlanInput = {
  route: IRouteRef;
  index: number;
  routeCount: number;
  options: IScreenOptions;
  emitter: INavigationEmitter;
  onPop: () => void;
  // Route keys whose resolved props were already logged, so the dump runs once per mount
  loggedKeys: Set<string>;
  // The app's search bar ref lives in the adapter's own ref type, so the adapter writes it
  // The node comes along for an adapter whose ref callback re-runs for the same node
  // Left out by an adapter that attaches the ref to the host element itself
  assignSearchBarHandle?: (
    handle: ISearchBarCommands | null,
    node: ISymbioteNode | null,
  ) => void;
};

// `onAppear`/`onDisappear` mark visibility after the transition, so they alone emit `focus`/`blur`
// The `onWill*` pair fires before the animation and would run every focus effect twice
function buildScreenPassthrough(
  routeName: string,
  emitter: INavigationEmitter,
  onPop: () => void,
): Record<string, () => void> {
  return {
    [SCREEN_ON_DISMISSED]: onPop,
    [SCREEN_ON_HEADER_BACK_BUTTON_CLICKED]: onPop,
    [SCREEN_ON_WILL_APPEAR]: () =>
      dlog(`Stack: route "${routeName}" will appear at t=${Date.now()}`),
    [SCREEN_ON_APPEAR]: () => {
      dlog(`Stack: route "${routeName}" appeared (focus) at t=${Date.now()}`);
      emitter.emit(NAVIGATION_EVENT_FOCUS);
    },
    [SCREEN_ON_WILL_DISAPPEAR]: () =>
      dlog(`Stack: route "${routeName}" will disappear at t=${Date.now()}`),
    [SCREEN_ON_DISAPPEAR]: () => {
      dlog(`Stack: route "${routeName}" disappeared (blur) at t=${Date.now()}`);
      emitter.emit(NAVIGATION_EVENT_BLUR);
    },
  };
}

// The ref lands straight on the `RNSSearchBar` host element, so `el` is already the engine node
// `debugNodeId` is compared with the commit logs: the same id proves it is the committed node
function buildSearchBarProps(
  routeName: string,
  searchBarOptions: ISearchBarOptions,
  assignHandle: IStackRoutePlanInput['assignSearchBarHandle'],
): Record<string, unknown> {
  const passthrough = buildSearchBarPassthrough(searchBarOptions, message =>
    dlog(`Stack: route "${routeName}" ${message}`),
  );
  if (assignHandle === undefined) return passthrough;
  return {
    ...passthrough,
    ref: (el: unknown): void => {
      const node = isSymbioteNode(el) ? el : null;
      dlog(
        `Stack: search bar ref callback, node=${node === null ? 'null' : debugNodeId(node)} at t=${Date.now()}`,
      );
      assignHandle(
        node === null ? null : buildSearchBarHandle(() => node),
        node,
      );
    },
  };
}

// Dumps the resolved native props once per `route.key`, to rule a transition timing mismatch in
// or out
function logResolvedScreenProps(
  plan: IScreenRenderPlan,
  route: IRouteRef,
  loggedKeys: Set<string>,
): void {
  if (loggedKeys.has(route.key)) return;
  loggedKeys.add(route.key);
  dlog(
    `Stack: route "${route.name}" resolved screen props ` +
      `stackAnimation=${String(plan.screenProps.stackAnimation)} ` +
      `stackPresentation=${String(plan.screenProps.stackPresentation)} ` +
      `transitionDuration=${String(plan.screenProps.transitionDuration)} ` +
      `gestureEnabled=${String(plan.screenProps.gestureEnabled)} at t=${Date.now()}`,
  );
}

// `onFinishTransitioning` is the native signal that the WHOLE push or pop animation ended, unlike
// the per-screen appear and disappear, so logging it checks their timestamps against the real end
export function buildStackHostProps(): ReturnType<typeof resolveStackProps> {
  return resolveStackProps({
    passthrough: {
      [STACK_ON_FINISH_TRANSITIONING]: () =>
        dlog(`Stack: onFinishTransitioning at t=${Date.now()}`),
    },
  });
}

export function resolveStackRoutePlan(
  input: IStackRoutePlanInput,
): IScreenRenderPlan {
  const { route, index, routeCount, options, emitter, loggedKeys } = input;
  // Logged on every render, to show whether `activityState` moves outside a push or pop
  dlog(
    `Stack: render route "${route.name}" index=${index}/${routeCount - 1} ` +
      `activityState=${computeActivityState(index, routeCount)} at t=${Date.now()}`,
  );
  const searchBarOptions = options.headerSearchBarOptions;
  const plan = resolveScreenRenderPlan({
    screenId: route.key,
    index,
    routeCount,
    options,
    platform: NAVIGATOR_PLATFORM,
    isAndroid: Platform.select({ android: true, default: false }) === true,
    screenPassthrough: buildScreenPassthrough(route.name, emitter, input.onPop),
    searchBarPassthrough: searchBarOptions
      ? buildSearchBarProps(
          route.name,
          searchBarOptions,
          input.assignSearchBarHandle,
        )
      : undefined,
  });
  logResolvedScreenProps(plan, route, loggedKeys);
  return plan;
}
