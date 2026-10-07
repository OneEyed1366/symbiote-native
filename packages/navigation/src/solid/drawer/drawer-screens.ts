// What the Solid Drawer renders for its routes: the focused screen, the descriptor map and the
// render-prop panel

import { createMemo, untrack } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import { buildDrawerDescriptors } from '../../core/drawer-descriptors';
import type {
  IDrawerDescriptorMap,
  IDrawerNavigatorHandle,
  IDrawerRouterState,
  INavigationEmitter,
} from '../../core';
import { createFocusedContent, createFocusedKey } from '../focused-content';
import type { INavigationScope } from '../navigation-context';
import type { IRegisteredScreen } from '../screen-registry';
import { trackFocus } from '../track-focus';
import type { IDrawerScreenProps } from '../drawer-screen-props';

type IDrawerScreenEntry = IRegisteredScreen<IDrawerScreenProps['options']>;

type IDrawerContentSlotProps = {
  state: IDrawerRouterState;
  descriptors: IDrawerDescriptorMap;
  navigation: IDrawerNavigatorHandle;
};

export type IDrawerScreensInput = {
  state: Accessor<IDrawerRouterState>;
  registry: Accessor<ReadonlyMap<string, IDrawerScreenEntry>>;
  handle: IDrawerNavigatorHandle;
  emitterFor: (routeKey: string) => INavigationEmitter;
  parentScope: INavigationScope | undefined;
  drawerContent:
    ((props: Accessor<IDrawerContentSlotProps>) => JSX.Element) | undefined;
};

function createDescriptors(
  input: IDrawerScreensInput,
): Accessor<IDrawerDescriptorMap> {
  const { state, registry, handle } = input;
  return createMemo(() =>
    buildDrawerDescriptors({
      state: state(),
      handle,
      entryFor: name => registry().get(name),
      optionsOf: entry => entry.options,
    }),
  );
}

export function createDrawerScreens(input: IDrawerScreensInput) {
  const { state, registry, handle, emitterFor, parentScope, drawerContent } =
    input;
  const focusedKey = createFocusedKey(state);
  trackFocus(focusedKey, emitterFor, 'Drawer');
  const descriptors = createDescriptors(input);

  // Own memo, called once: the markers have not registered when the Drawer body runs, and a plain
  // cache would hand a re-running slot effect nodes whose reactivity was already disposed
  const panel = createMemo(() =>
    untrack(() =>
      drawerContent?.(() => ({
        state: state(),
        descriptors: descriptors(),
        navigation: handle,
      })),
    ),
  );

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
  return { content, panel };
}
