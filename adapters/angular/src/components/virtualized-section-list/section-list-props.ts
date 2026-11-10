// The public prop surface of the Angular VirtualizedSectionList, apart from the class

import type {
  IAccessibilityProps,
  IAriaProps,
  IInnerViewRef,
} from '@symbiote-native/components';
import type {
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import type { ISection } from './directives';

export type IItemLayout = { length: number; offset: number; index: number };

// The React and Vue surface minus element-returning props, which are `<ng-template>` here
export type IVirtualizedSectionListProps<ItemT> = IAccessibilityProps &
  IAriaProps & {
    sections: ReadonlyArray<ISection<ItemT>>;
    keyExtractor?: (item: ItemT, index: number) => string;
    // Flat like RN's: the sections array plus a flat entry index, where every section adds two rows
    // beyond its items (header, footer). Without it a fast scroll outruns measurement
    getItemLayout?: (
      data: ReadonlyArray<ISection<ItemT>> | null,
      index: number,
    ) => IItemLayout;
    // Defaults to `Platform.OS === 'ios'`, pass true or false to override
    stickySectionHeadersEnabled?: boolean;
    extraData?: unknown;
    onEndReached?: (info: { distanceFromEnd: number }) => void;
    onEndReachedThreshold?: number;
    onStartReached?: (info: { distanceFromStart: number }) => void;
    onStartReachedThreshold?: number;
    onRefresh?: () => void;
    refreshing?: boolean | null;
    progressViewOffset?: number;
    initialNumToRender?: number;
    initialScrollIndex?: number;
    maxToRenderPerBatch?: number;
    updateCellsBatchingPeriod?: number;
    windowSize?: number;
    disableVirtualization?: boolean;
    inverted?: boolean;
    horizontal?: boolean;
    maintainVisibleContentPosition?: {
      minIndexForVisible: number;
      autoscrollToTopThreshold?: number;
    };
    onScroll?: (event: ISymbioteEvent) => void;
    onScrollBeginDrag?: (event: ISymbioteEvent) => void;
    onScrollEndDrag?: (event: ISymbioteEvent) => void;
    onMomentumScrollBegin?: (event: ISymbioteEvent) => void;
    onMomentumScrollEnd?: (event: ISymbioteEvent) => void;
    onContentSizeChange?: (width: number, height: number) => void;
    scrollEventThrottle?: number;
    keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
    keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
    removeClippedSubviews?: boolean;
    nestedScrollEnabled?: boolean;
    stickyHeaderHiddenOnScroll?: boolean;
    innerViewRef?: IInnerViewRef;
    style?: IStyleProp<IViewStyle>;
    contentContainerStyle?: IStyleProp<IViewStyle>;
    listHeaderComponentStyle?: IStyleProp<IViewStyle>;
    listFooterComponentStyle?: IStyleProp<IViewStyle>;
  };

// The plain inputs: the full surface minus the events exposed as real outputs
export type IVirtualizedSectionListInputs<ItemT> = Omit<
  IVirtualizedSectionListProps<ItemT>,
  | 'onEndReached'
  | 'onStartReached'
  | 'onRefresh'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;
