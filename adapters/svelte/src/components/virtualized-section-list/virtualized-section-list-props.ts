// `IVirtualizedSectionListProps`'s canonical home. Per-adapter (Snippet render props), same
// rationale as virtualized-list-props.ts. `ISection`/`IVirtualizedSectionListHandle` themselves
// ARE framework-agnostic (plain data / plain method signatures) and come straight from
// @symbiote-native/components — only the render-callback fields below are hand-declared here.
import type { Snippet } from 'svelte';
import type {
  IClassNameValue,
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
  ISection,
  ISeparatorProps,
  ISeparators,
  IVirtualizedSectionListHandle,
} from '@symbiote-native/components';
import type { ISvelteClassValue } from '../../class-value';

export type { ISection, IVirtualizedSectionListHandle };

export interface IVirtualizedSectionListProps<ItemT>
  extends IAccessibilityProps, IAriaProps {
  sections: ReadonlyArray<ISection<ItemT>>;
  item: Snippet<
    [
      {
        item: ItemT;
        index: number;
        section: ISection<ItemT>;
        separators: ISeparators;
      },
    ]
  >;
  sectionHeader?: Snippet<[{ section: ISection<ItemT> }]>;
  sectionFooter?: Snippet<[{ section: ISection<ItemT> }]>;
  // Painted between adjacent sections (after one section's footer, before the next section's
  // header). The Svelte twin of RN's SectionSeparatorComponent.
  sectionSeparator?: Snippet;
  separator?: Snippet<[ISeparatorProps<ItemT>]>;
  header?: Snippet;
  footer?: Snippet;
  empty?: Snippet;
  keyExtractor?: (item: ItemT, index: number) => string;
  // Fixed-layout fast path, FLAT like RN's: the SECTIONS array plus a flat entry index, where every
  // section contributes two rows beyond its items (header, footer) and the caller accounts for them.
  // A `({ section, index })` form would be our invention, not parity - `VirtualizedSectionList.js`
  // has no getItemLayout code at all, the prop rides through `passThroughProps`; that shape is the
  // community react-native-section-list-get-item-layout, layered on top. Without it a fast scroll
  // outruns measurement and leaves blank windows.
  getItemLayout?: (
    data: ReadonlyArray<ISection<ItemT>> | null,
    index: number,
  ) => { length: number; offset: number; index: number };
  // Stick each section header to the top as the next section scrolls up. Defaults to
  // `Platform.OS === 'ios'`; Android does not stick by default. Pass true/false to override.
  stickySectionHeadersEnabled?: boolean;
  extraData?: unknown;
  onEndReached?: (info: { distanceFromEnd: number }) => void;
  onEndReachedThreshold?: number;
  onStartReached?: (info: { distanceFromStart: number }) => void;
  onStartReachedThreshold?: number;
  // Pull-to-refresh — delegates straight through to the inner VirtualizedList's own
  // RefreshControl wiring, same as React's VirtualizedSectionList.
  onRefresh?: () => void;
  refreshing?: boolean | null;
  progressViewOffset?: number;
  initialNumToRender?: number;
  initialScrollIndex?: number;
  maxToRenderPerBatch?: number;
  updateCellsBatchingPeriod?: number;
  windowSize?: number;
  inverted?: boolean;
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  onScroll?: (event: ISymbioteEvent) => void;
  onScrollBeginDrag?: (event: ISymbioteEvent) => void;
  onScrollEndDrag?: (event: ISymbioteEvent) => void;
  onMomentumScrollBegin?: (event: ISymbioteEvent) => void;
  onMomentumScrollEnd?: (event: ISymbioteEvent) => void;
  scrollEventThrottle?: number;
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  style?: IStyleProp<IViewStyle>;
  contentContainerStyle?: IStyleProp<IViewStyle>;
  class?: ISvelteClassValue;
}
