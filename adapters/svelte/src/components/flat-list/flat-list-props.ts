// `IFlatListProps`'s canonical home. Per-adapter (Snippet render props), same rationale as
// virtualized-list-props.ts. FlatList's surface is VirtualizedList's, minus the raw
// data/getItem/getItemCount trio (FlatList derives them from a plain `data` array), plus
// numColumns/columnWrapperStyle — kept as an Omit so the two prop types cannot drift apart.
// IAccessibilityProps/IAriaProps (testID, accessibilityLabel, aria-*, …) and onRefresh/refreshing/
// progressViewOffset ride in for free through the Omit — IVirtualizedListProps already extends
// them and none of those fields are in the Omit list — so this type needs no explicit `extends`.
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import type { IViewabilityConfigCallbackPair } from '@symbiote-native/components';
import type {
  IVirtualizedListHandle,
  IVirtualizedListProps,
} from '../virtualized-list/virtualized-list-props';

export type { IVirtualizedListHandle as IFlatListHandle };

export type IFlatListProps<ItemT> = Omit<
  IVirtualizedListProps<ItemT>,
  'data' | 'getItem' | 'getItemCount' | 'viewabilityConfigCallbackPairs'
> & {
  data: readonly ItemT[];
  numColumns?: number;
  // A bare string resolves through the shared style registry (like a class name); a style
  // object/array flows through unchanged. Mirrors the Vue adapter's columnWrapperStyle.
  columnWrapperStyle?: IStyleProp<IViewStyle> | string;
  viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
};
