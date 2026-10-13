import type { Component } from 'svelte';
import type { IFlatListHandle } from '@symbiote-native/svelte';
import type { IAnimatedFlatListProps } from './animated-flat-list-props';

export type { IAnimatedFlatListProps };

declare const AnimatedFlatList: Component<
  IAnimatedFlatListProps<unknown>,
  IFlatListHandle
>;
export default AnimatedFlatList;
