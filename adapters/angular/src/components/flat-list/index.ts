// FlatList, the convenience surface over VirtualizedList: a plain `data` array, and `numColumns`
// packing items into rows so the virtualized stream is rows, not items. The row shaping is shared
// with the React and Vue FlatLists, windowing and the scroll handle come from VirtualizedList

import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  ViewChild,
  inject,
  type DoCheck,
  type OnChanges,
  type SimpleChanges,
} from '@angular/core';
import {
  SINGLE_COLUMN,
  arrayLikeLength,
  chunkIntoRows,
  expandRowViewability,
  firstItemOfRow,
  lastItemOfRow,
  removeClippedSubviewsOrDefault,
  rowKeyExtractor,
  type IRow,
  type IScrollViewHandle,
  type ISeparators,
  type IViewabilityConfigCallbackPair,
  type IViewableItemsChangedInfo,
  type IVirtualizedListHandle,
} from '@symbiote-native/components';
import {
  Platform,
  dlog,
  flattenStyle,
  resolveClassName,
  type IStyleProp,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  VirtualizedList,
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListSeparatorDirective,
  type IVirtualizedListProps,
  type IVListItemContext,
  type IVListSeparatorContext,
} from '../virtualized-list';
import { VListOutletDirective } from '../virtualized-list/directives';
import { ListInputsBase } from '../virtualized-list/list-inputs';
import { provideGateDemand } from '../../gate-demand';
import {
  stableAnchorStyle,
  SymbioteStyleInputDirective,
  ViewHost,
} from '../../primitives';
import { FLAT_LIST_TEMPLATE } from './flat-list-template';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function isRow<ItemT>(value: unknown): value is IRow<ItemT> {
  return (
    isRecord(value) &&
    Array.isArray(value['items']) &&
    typeof value['startIndex'] === 'number'
  );
}
function isSeparators(value: unknown): value is ISeparators {
  return (
    isRecord(value) &&
    typeof value['highlight'] === 'function' &&
    typeof value['unhighlight'] === 'function'
  );
}
// A fallback for a row whose separators handle is absent, `VirtualizedList` always supplies one
const NOOP_SEPARATORS: ISeparators = {
  highlight: (): void => undefined,
  unhighlight: (): void => undefined,
  updateProps: (): void => undefined,
};

// Re-exported so the app imports the cell and slot directives alongside FlatList
export type {
  ISeparators,
  IViewableItemsChangedInfo,
  IViewabilityConfigCallbackPair,
  IVirtualizedListHandle,
} from '@symbiote-native/components';
export {
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListSeparatorDirective,
} from '../virtualized-list';
export type {
  IVListItemContext,
  IVListSeparatorContext,
} from '../virtualized-list';

export type IFlatListHandle = IVirtualizedListHandle;

// Every agnostic VirtualizedList prop except the data trio, plus `numColumns` and its row style
export type IFlatListProps<ItemT> = Omit<
  IVirtualizedListProps<ItemT>,
  'data' | 'getItem' | 'getItemCount'
> & {
  data: readonly ItemT[];
  numColumns?: number;
  // A bare string resolves through the shared style registry
  columnWrapperStyle?: IStyleProp<IViewStyle> | string;
};

// The plain inputs: the full surface minus the events exposed as real outputs
export type IFlatListInputs<ItemT> = Omit<
  IFlatListProps<ItemT>,
  | 'onEndReached'
  | 'onStartReached'
  | 'onRefresh'
  | 'onViewableItemsChanged'
  | 'onScrollToIndexFailed'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

@Component({
  selector: 'FlatList',
  standalone: true,
  viewProviders: [provideGateDemand(() => FlatList)],
  hostDirectives: [
    { directive: SymbioteStyleInputDirective, inputs: ['style'] },
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    VirtualizedList,
    VListItemDirective,
    VListHeaderDirective,
    VListFooterDirective,
    VListEmptyDirective,
    VListSeparatorDirective,
    VListOutletDirective,
    ViewHost,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: FLAT_LIST_TEMPLATE,
})
export class FlatList<ItemT = unknown>
  extends ListInputsBase<ItemT>
  implements IFlatListInputs<ItemT>, IVirtualizedListHandle, DoCheck, OnChanges
{
  @Input({ required: true }) data!: readonly ItemT[];
  @Input() numColumns?: number;
  @Input() columnWrapperStyle?: IStyleProp<IViewStyle> | string;

  // The list always gets a value here, defaulted per platform
  get resolvedRemoveClippedSubviews(): boolean {
    return removeClippedSubviewsOrDefault(
      this.removeClippedSubviews,
      Platform.OS,
    );
  }

  // The composed inner list, whichever branch rendered, its instance is the scroll handle
  @ViewChild(VirtualizedList) private listRef?: VirtualizedList;

  // This component's own host, the anchor `class="..."` resolves onto, not the inner list's
  private readonly elementRef = inject(ElementRef);

  rows: IRow<ItemT>[] = [];
  // `[style]` compiles to an instruction that takes a flat object only, so styles are flattened
  rowStyle: IViewStyle = flattenStyle([{ flexDirection: 'row' }]);
  rowViewabilityPairs?: IViewabilityConfigCallbackPair<IRow<ItemT>>[];
  readonly columnCellStyle: IViewStyle = { flex: 1 };
  resolvedStyle: IViewStyle | undefined = undefined;

  get columns(): number {
    return this.numColumns ?? SINGLE_COLUMN;
  }
  get isMultiColumn(): boolean {
    return this.columns > SINGLE_COLUMN;
  }

  // `ngDoCheck`, not `ngOnChanges`: a bare `class=` never becomes an input and would freeze the
  // merge. `stableAnchorStyle` keeps the reference steady so the inner list's dedup gate holds
  ngDoCheck(): void {
    this.resolvedStyle = stableAnchorStyle(
      this.elementRef,
      this.style,
      this.resolvedStyle,
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['columnWrapperStyle'] !== undefined) {
      // A class-name string resolves through the shared registry before `flattenStyle`
      const resolvedColumnWrapperStyle =
        typeof this.columnWrapperStyle === 'string'
          ? resolveClassName(this.columnWrapperStyle)
          : this.columnWrapperStyle;
      this.rowStyle = flattenStyle([
        { flexDirection: 'row' },
        resolvedColumnWrapperStyle,
      ]);
    }
    if (changes['data'] !== undefined || changes['numColumns'] !== undefined) {
      this.rows = this.isMultiColumn
        ? chunkIntoRows(this.data, this.columns)
        : [];
      dlog(
        `Angular FlatList over ${arrayLikeLength(this.data)} items, ${this.columns} column(s)`,
      );
    }
    if (
      changes['viewabilityConfigCallbackPairs'] !== undefined ||
      changes['numColumns'] !== undefined
    ) {
      this.rowViewabilityPairs = this.buildRowViewabilityPairs();
    }
  }

  getFlatItem = (_data: unknown, index: number): ItemT => this.data[index];
  getFlatCount = (_data: unknown): number => arrayLikeLength(this.data);

  // With several columns the virtualized stream is rows
  getRow = (_data: unknown, index: number): IRow<ItemT> => this.rows[index];
  getRowCount = (_data: unknown): number => this.rows.length;
  rowKey = (row: IRow<ItemT>, _index: number): string =>
    rowKeyExtractor(row, this.keyExtractor);

  // Row viewability expands back to per-item tokens, so the caller sees items, not rows
  rowViewableItemsChanged = (
    info: IViewableItemsChangedInfo<IRow<ItemT>>,
  ): void => {
    this.viewableItemsChanged.emit(
      expandRowViewability(info, this.keyExtractor),
    );
  };

  private buildRowViewabilityPairs():
    IViewabilityConfigCallbackPair<IRow<ItemT>>[] | undefined {
    return this.viewabilityConfigCallbackPairs?.map(pair => ({
      viewabilityConfig: pair.viewabilityConfig,
      onViewableItemsChanged: (
        rowInfo: IViewableItemsChangedInfo<IRow<ItemT>>,
      ): void => {
        pair.onViewableItemsChanged?.(
          expandRowViewability(rowInfo, this.keyExtractor),
        );
      },
    }));
  }

  // Every item shares the row's separators handle and carries its absolute index. The arguments
  // arrive `unknown` from the template's `let` bindings and are narrowed here
  rowCells(
    row: unknown,
    separators: unknown,
  ): { key: string; context: IVListItemContext<ItemT> }[] {
    if (!isRow<ItemT>(row)) return [];
    const handle = isSeparators(separators) ? separators : NOOP_SEPARATORS;
    return row.items.map((item, column) => {
      const index = row.startIndex + column;
      const key = this.keyExtractor
        ? this.keyExtractor(item, index)
        : String(index);
      return { key, context: { $implicit: item, index, separators: handle } };
    });
  }

  // The divider between rows shows real items, so the app's separator template sees items
  rowSeparatorContext(
    highlighted: unknown,
    leadingRow: unknown,
    trailingRow: unknown,
  ): IVListSeparatorContext<ItemT> {
    const isHighlighted = highlighted === true;
    return {
      $implicit: isHighlighted,
      highlighted: isHighlighted,
      leadingItem: isRow<ItemT>(leadingRow)
        ? lastItemOfRow(leadingRow)
        : undefined,
      trailingItem: isRow<ItemT>(trailingRow)
        ? firstItemOfRow(trailingRow)
        : undefined,
    };
  }

  scrollToOffset(params: { offset: number; animated?: boolean }): void {
    this.listRef?.scrollToOffset(params);
  }
  scrollToIndex(params: {
    index: number;
    animated?: boolean;
    viewOffset?: number;
    viewPosition?: number;
  }): void {
    this.listRef?.scrollToIndex(params);
  }
  scrollToItem(params: {
    item: unknown;
    animated?: boolean;
    viewPosition?: number;
  }): void {
    this.listRef?.scrollToItem(params);
  }
  scrollToEnd(params?: { animated?: boolean }): void {
    this.listRef?.scrollToEnd(params);
  }
  flashScrollIndicators(): void {
    this.listRef?.flashScrollIndicators();
  }
  getNativeScrollRef(): IScrollViewHandle | null {
    return this.listRef?.getNativeScrollRef() ?? null;
  }
  getScrollableNode(): IScrollViewHandle | null {
    return this.listRef?.getScrollableNode() ?? null;
  }
  getScrollResponder(): IScrollViewHandle | null {
    return this.listRef?.getScrollResponder() ?? null;
  }
  getScrollNode(): ISymbioteNode | null {
    return this.listRef?.getScrollNode() ?? null;
  }
  getScrollRef(): ISymbioteNode | null {
    return this.listRef?.getScrollRef() ?? null;
  }
  recordInteraction(): void {
    this.listRef?.recordInteraction();
  }
  setNativeProps(props: Record<string, unknown>): void {
    this.listRef?.setNativeProps(props);
  }
}
