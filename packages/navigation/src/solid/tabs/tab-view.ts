// The Solid Tab's view: the bar rebuilt only when its shape changes, over the focused screen

import { createMemo, untrack } from 'solid-js';
import type { Accessor } from 'solid-js';
import { descriptorToSolid } from '@symbiote-native/solid';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import { insert } from '@symbiote-native/solid/renderer';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { renderTabBar } from '../../core';
import type {
  ITabBarIcon,
  ITabBarItemView,
  ITabNavigatorHandle,
  ITabOptions,
  ITabRouterState,
} from '../../core';
import {
  buildTabBarItems,
  resolveFocusedTabOptions,
} from '../../core/tab-bar-model';
import type { ITabBarInput } from '../../core/tab-bar-model';
import { hostElement } from '../host';
import type { IRegisteredScreen } from '../screen-registry';
import type { ITabScreenProps } from '../tab-screen-props';

type ITabScreenEntry = IRegisteredScreen<ITabScreenProps['options']>;

export type ITabViewInput = {
  state: Accessor<ITabRouterState>;
  registry: Accessor<ReadonlyMap<string, ITabScreenEntry>>;
  handle: ITabNavigatorHandle;
  screenOptions: () => ITabOptions | undefined;
  content: Accessor<JSX.Element>;
};

const FILL_STYLE = { flex: 1 };

// An icon is spliced into the bar verbatim, so only its ROOT type is visible here
// An icon swapped for one of the same type with other children still trips the bridge's guard
function iconKind(icon: ITabBarIcon | undefined): string {
  if (icon === undefined) return '-';
  return typeof icon === 'string' ? 'glyph' : icon.type;
}

// The bar's descriptor SHAPE follows its data: a screen is added, or a badge appears, and an item
// gains an icon wrapper. The bar is rebuilt when this string changes and only then
function barSignature(items: readonly ITabBarItemView[]): string {
  return items
    .map(
      item =>
        `${item.key}:${iconKind(item.icon)}:${item.badge === undefined ? 0 : 1}`,
    )
    .join('|');
}

function barInput(input: ITabViewInput): ITabBarInput<ITabScreenEntry> {
  return {
    state: input.state(),
    handle: input.handle,
    entryFor: name => input.registry().get(name),
    optionsOf: entry => entry.options,
    screenOptions: input.screenOptions(),
  };
}

function createTabBar(input: ITabViewInput): Accessor<ISymbioteNode> {
  const items = createMemo(() => buildTabBarItems(barInput(input)));
  const focusedOptions = createMemo(() =>
    resolveFocusedTabOptions(barInput(input)),
  );
  const barShape = createMemo(() => barSignature(items()));
  return createMemo(() => {
    barShape();
    return untrack(() =>
      descriptorToSolid(() =>
        renderTabBar({
          items: items(),
          style: focusedOptions()?.tabBarStyle,
          passthrough: {},
        }),
      ),
    );
  });
}

export function createTabRoot(input: ITabViewInput): ISymbioteNode {
  const tabBar = createTabBar(input);
  const contentHost = hostElement('view', () => ({ style: FILL_STYLE }));
  insert(contentHost, input.content);

  const root = hostElement('view', () => ({ style: FILL_STYLE }));
  // ONE array insert: a second `insert` on the same parent would replace the first child, while an
  // array is reconciled by identity, so `contentHost` keeps its node and only the bar is swapped
  insert(root, (): readonly ISymbioteNode[] => [contentHost, tabBar()]);
  return root;
}
