import type { IFlatListProps, IViewProps } from '@symbiote-native/svelte';
import type { IAnimatedHostProps } from './animated-host-props';

type IRowStyle = IAnimatedHostProps<IViewProps>['style'];
type IRowLayout = IAnimatedHostProps<IViewProps>['layout'];

// What the list hands a cell renderer: the item and its index come with the view parts
export type IListCell = Parameters<
  NonNullable<IFlatListProps<unknown>['cellRenderer']>
>[0];

export type IAnimatedFlatListProps<ItemT> = Omit<
  IFlatListProps<ItemT>,
  'cellRenderer'
> & {
  // Works for a single column only, as upstream's does
  itemLayoutAnimation?: IRowLayout;
  // Rows neither animate in nor out while the list mounts or unmounts
  skipEnteringExitingAnimations?: boolean;
  // A style for every row, or one made from the item and its index
  cellRendererComponentStyle?:
    IRowStyle | ((info: { item: unknown; index: number }) => IRowStyle);
};
