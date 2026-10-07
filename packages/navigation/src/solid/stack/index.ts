// Stack, the Solid lifecycle half: a signal for the pushed routes, seeded once markers register
// The route transitions and the options and props folds live in core, shared with every adapter
// The Solid-only rules (empty registry at first, keyed routes, rebuild boundaries): stack-route.ts

import { For, createComponent, createMemo } from 'solid-js';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import { insert } from '@symbiote-native/solid/renderer';
import { RNS_SCREEN_STACK_VIEW_NAME, buildStackHostProps } from '../../core';
import type { INavigatorHandle } from '../../core';
import { hostElement } from '../host';
import { useNavigationScope } from '../navigation-context';
import {
  ScreenCollectorProvider,
  createScreenSignal,
  toRegistry,
} from '../screen-registry';
import { Screen } from '../screen';
import type { IScreenProps, ISolidScreenOptions } from '../screen-props';
import { createRouteRenderer } from './stack-route';
import { createStackState } from './stack-state';

export type { INavigatorHandle } from '../../core';

// React's `children` and Vue's default slot become Solid's `children`, the markers that register
// themselves. `ref` is Solid's spelling of Vue's `expose()`: a callback handed the handle
export type IStackProps = {
  initialRouteName?: string;
  screenOptions?: ISolidScreenOptions;
  ref?: (handle: INavigatorHandle) => void;
  children?: JSX.Element;
};

// Route keys are unique per navigator INSTANCE, and Solid has no `useId`, so a counter stands in
let navigatorSequence = 0;

function StackImpl(props: IStackProps): JSX.Element {
  // Read BEFORE this Stack provides its own scope, as it becomes the `parent` of its screens
  const parentScope = useNavigationScope();
  const { screens, collector } = createScreenSignal<
    'stack',
    IScreenProps['options']
  >('stack');
  const registry = createMemo(() => toRegistry(screens()));
  navigatorSequence += 1;
  const { currentState, dispatch, handle, emitterFor, routeKeys } =
    createStackState(
      registry,
      `stack-${navigatorSequence}`,
      () => props.initialRouteName,
    );
  props.ref?.(handle);

  const renderRoute = createRouteRenderer({
    registry,
    currentState,
    handle,
    onPop: () => dispatch({ type: 'pop', count: 1 }),
    emitterFor,
    parentScope,
    screenOptions: () => props.screenOptions,
    loggedKeys: new Set<string>(),
  });

  const root = hostElement(RNS_SCREEN_STACK_VIEW_NAME, buildStackHostProps);
  // The `<For>` is created EAGERLY and handed to `insert` as a value, as a thunk would read `each`
  // inside the insert effect and re-create the whole list on every route change
  insert(
    root,
    createComponent(For, {
      get each(): readonly string[] {
        return routeKeys();
      },
      children: renderRoute,
    }),
  );

  // `props.children` is read here and nowhere else: reading it CREATES the markers, and they must
  // be created inside this provider so they find the collector on the owner chain
  return createComponent(ScreenCollectorProvider, {
    value: collector,
    get children(): JSX.Element {
      return [props.children, root];
    },
  });
}

export const Stack = Object.assign(StackImpl, { Screen });
