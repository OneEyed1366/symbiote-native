// The list surface Angular binds statically: inputs, outputs and projected templates. Kept apart
// from the components so the windowing lifecycle reads on its own

import {
  ContentChild,
  Directive,
  EventEmitter,
  Input,
  Output,
  TemplateRef,
} from '@angular/core';
import {
  DEFAULT_INITIAL_NUM_TO_RENDER,
  DEFAULT_MAX_TO_RENDER_PER_BATCH,
  DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
  DEFAULT_WINDOW_SIZE,
  type IInnerViewRef,
  type IViewabilityConfig,
  type IViewabilityConfigCallbackPair,
  type IViewableItemsChangedInfo,
} from '@symbiote-native/components';
import type {
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import {
  VListCellDirective,
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListSeparatorDirective,
  type IVListCellContext,
  type IVListItemContext,
  type IVListSeparatorContext,
} from './directives';
import { ListEventsBase } from './list-events';

// What `VirtualizedList` and `FlatList` share: the windowing inputs and the slot templates
@Directive()
export abstract class ListInputsBase<ItemT> extends ListEventsBase {
  @Output() readonly viewableItemsChanged = new EventEmitter<
    IViewableItemsChangedInfo<ItemT>
  >();
  @Output() readonly scrollToIndexFailed = new EventEmitter<{
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }>();

  @Input() keyExtractor?: (item: ItemT, index: number) => string;
  @Input() getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number };
  @Input() horizontal?: boolean;
  @Input() inverted?: boolean;
  @Input() extraData?: unknown;
  @Input() onEndReachedThreshold?: number;
  @Input() onStartReachedThreshold?: number;
  @Input() refreshing?: boolean | null;
  @Input() progressViewOffset?: number;
  @Input() viewabilityConfig?: IViewabilityConfig;
  @Input()
  viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
  @Input() initialNumToRender?: number;
  @Input() initialScrollIndex?: number;
  @Input() maxToRenderPerBatch?: number;
  @Input() updateCellsBatchingPeriod?: number;
  @Input() windowSize?: number;
  // Mounts every cell from the top and paints no spacer, the window only grows toward the end
  @Input() disableVirtualization?: boolean;
  @Input() stickyHeaderIndices?: number[];
  @Input() maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  @Input() onScroll?: (event: ISymbioteEvent) => void;
  @Input() onScrollBeginDrag?: (event: ISymbioteEvent) => void;
  @Input() onScrollEndDrag?: (event: ISymbioteEvent) => void;
  @Input() onMomentumScrollBegin?: (event: ISymbioteEvent) => void;
  @Input() onMomentumScrollEnd?: (event: ISymbioteEvent) => void;
  @Input() onContentSizeChange?: (width: number, height: number) => void;
  @Input() scrollEventThrottle?: number;
  @Input() keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  @Input() keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  @Input() removeClippedSubviews?: boolean;
  @Input() nestedScrollEnabled?: boolean;
  @Input() stickyHeaderHiddenOnScroll?: boolean;
  @Input() innerViewRef?: IInnerViewRef;
  @Input() style?: IStyleProp<IViewStyle>;
  @Input() contentContainerStyle?: IStyleProp<IViewStyle>;
  @Input() listHeaderComponentStyle?: IStyleProp<IViewStyle>;
  @Input() listFooterComponentStyle?: IStyleProp<IViewStyle>;
  @Input() testID?: string;
  @Input() nativeID?: string;

  // The cell and slot templates the app authors, captured from projected <ng-template> content
  @ContentChild(VListItemDirective) itemDir?: VListItemDirective<ItemT>;
  @ContentChild(VListHeaderDirective) headerDir?: VListHeaderDirective;
  @ContentChild(VListFooterDirective) footerDir?: VListFooterDirective;
  @ContentChild(VListEmptyDirective) emptyDir?: VListEmptyDirective;
  @ContentChild(VListSeparatorDirective)
  separatorDir?: VListSeparatorDirective<ItemT>;
  @ContentChild(VListCellDirective) cellDir?: VListCellDirective;

  get isHorizontal(): boolean {
    return this.horizontal === true;
  }

  protected get isInverted(): boolean {
    return this.inverted === true;
  }

  protected get windowSizeValue(): number {
    return this.windowSize ?? DEFAULT_WINDOW_SIZE;
  }

  protected get initialNumToRenderValue(): number {
    return this.initialNumToRender ?? DEFAULT_INITIAL_NUM_TO_RENDER;
  }

  protected get maxToRenderPerBatchValue(): number {
    return this.maxToRenderPerBatch ?? DEFAULT_MAX_TO_RENDER_PER_BATCH;
  }

  protected get updateCellsBatchingPeriodValue(): number {
    return (
      this.updateCellsBatchingPeriod ?? DEFAULT_UPDATE_CELLS_BATCHING_PERIOD
    );
  }
}

@Directive()
export abstract class VirtualizedListInputs<
  ItemT,
> extends ListInputsBase<ItemT> {
  @Input({ required: true }) data!: unknown;
  @Input({ required: true }) getItem!: (data: unknown, index: number) => ItemT;
  @Input({ required: true }) getItemCount!: (data: unknown) => number;
  // Set by a wrapper (`FlatList`, `VirtualizedSectionList`) that always binds `(refresh)` here to
  // re-forward the event, which keeps `refresh.observed` permanently true. The wrapper passes its
  // own public `refresh.observed` instead, direct usage falls back to this component's own
  @Input() refreshRequested?: boolean;

  // A wrapping list hands its app's cell and separator templates straight in, so a cell is one
  // outlet deep instead of a wrapper outlet around the app's own. Each wins over projection
  @Input() itemTemplate?: TemplateRef<IVListItemContext<ItemT>>;
  @Input() itemSeparatorTemplate?: TemplateRef<IVListSeparatorContext<ItemT>>;
  @Input() cellRendererTemplate?: TemplateRef<IVListCellContext>;

  get cellRendererTpl(): TemplateRef<IVListCellContext> | undefined {
    return this.cellRendererTemplate ?? this.cellDir?.templateRef;
  }

  get cellTemplate(): TemplateRef<IVListItemContext<ItemT>> | undefined {
    return this.itemTemplate ?? this.itemDir?.templateRef;
  }

  get separatorTemplate():
    TemplateRef<IVListSeparatorContext<ItemT>> | undefined {
    return this.itemSeparatorTemplate ?? this.separatorDir?.templateRef;
  }
}
