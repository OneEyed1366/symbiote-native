// `Stack.Screen` is a marker that never renders, `Stack` scans its default slot for it
// and reads `vnode.props` into the name to {component, options} registry

import { defineComponent } from '@vue/runtime-core';
import type { Component, Ref, VNodeChild } from '@vue/runtime-core';
import type { IRoute } from '../core';
import type {
  ISearchBarCommands,
  ISearchBarOptions,
  IScreenOptions,
  INavigatorHandle,
} from '../core';

// The imperative `ref` carries a Vue ref type, so it cannot live in the shared `ISearchBarOptions`
// This overlay adds it, the Vue twin of `IReactSearchBarOptions` with a `Ref<T | null>`
export type IVueSearchBarOptions = ISearchBarOptions & {
  ref?: Ref<ISearchBarCommands | null>;
};

export type IVueScreenOptions = Omit<
  IScreenOptions,
  'headerSearchBarOptions'
> & {
  headerSearchBarOptions?: IVueSearchBarOptions;
  headerLeft?: () => VNodeChild;
  headerRight?: () => VNodeChild;
  headerTitle?: () => VNodeChild;
  sheetFooter?: () => VNodeChild;
};

// The resolver runs outside render and gets the route and navigator handle as arguments
// Screens read those through composables, a resolver has no component scope to inject from
export type IScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: INavigatorHandle;
};

export type IScreenOptionsResolver = (
  args: IScreenOptionsArgs,
) => IVueScreenOptions;

export type IScreenProps = {
  name: string;
  component: Component;
  options?: IVueScreenOptions | IScreenOptionsResolver;
  initialParams?: unknown;
};

export const Screen = defineComponent<IScreenProps>(() => () => null, {
  name: 'Screen',
  inheritAttrs: false,
});
