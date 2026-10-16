import type { ComponentConstructorOptions, SvelteComponent } from 'svelte';
import type { IFlatListHandle } from '@symbiote-native/svelte';
import type { IAnimatedFlatListProps } from './animated-flat-list-props';

export type { IAnimatedFlatListProps };

// Generic over the item, the shape svelte2tsx gives a `generics` component, so the item type is
// read from `data` and a key extractor or an item snippet gets it
type IAnimatedFlatList = {
  new <ItemT>(
    options: ComponentConstructorOptions<IAnimatedFlatListProps<ItemT>>,
  ): SvelteComponent<IAnimatedFlatListProps<ItemT>> & IFlatListHandle;
  <ItemT>(
    internal: unknown,
    props: IAnimatedFlatListProps<ItemT>,
  ): IFlatListHandle;
};

declare const AnimatedFlatList: IAnimatedFlatList;
export default AnimatedFlatList;
