// Angular lifecycle half of VirtualizedList, the windowing engine is shared with React and Vue
// The bound surface is in ./list-inputs.ts, cells in ./cell-registry.ts, effects in
// ./list-effects.ts, styles in ./list-styles.ts and the authoring templates in ./directives.ts

import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  ViewChild,
  forwardRef,
  inject,
  type AfterViewChecked,
  type DoCheck,
  type OnDestroy,
  type TemplateRef,
} from '@angular/core';
import {
  EMPTY_OFFSET,
  FIRST_INDEX,
  LIST_ACTION_KIND,
  LIST_SEGMENT_KIND,
  buildScrollViewHandle,
  buildViewabilityPairs,
  createInitialListState,
  createListNesting,
  deriveWindow,
  listEffectSignature,
  listHasMore,
  planFromMetrics,
  reduceList,
  resolveItemKey,
  type IListAction,
  type IListNesting,
  type IListReducerInputs,
  type IListScope,
  type IListState,
  type IScrollViewHandle,
  type IViewableItemsChangedInfo,
} from '@symbiote-native/components';
import {
  dlog,
  isSymbioteNode,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
import { countAngular } from '../../diagnostics';
import {
  anchorHostStyle,
  SymbioteHostPropsDirective,
  SymbioteStyleInputDirective,
  ViewHost,
} from '../../primitives';
import { CellRegistry } from './cell-registry';
import { buildCellRendererContext } from './cell-renderer-context';
import { VListOutletDirective } from './directives';
import { ListEffectRunner } from './list-effects';
import { VirtualizedListBagsBase } from './list-bags';
import type { IVirtualizedListInputs } from './list-props';
import { injectVirtualizedListScope, ListScopeProvider } from './nested-scope';
import { stampPlanRows, type IListRow, type IRowsParams } from './list-rows';
import { resolveListStyles } from './list-styles';
import { VIRTUALIZED_LIST_TEMPLATE } from './list-template';

// Re-exported so flat-list and section-list keep importing them from '../virtualized-list'
export type {
  ICellLayout,
  ISeparators,
  ISeparatorProps,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IVirtualizedListHandle,
} from '@symbiote-native/components';
export {
  VListCellDirective,
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListOutletDirective,
  VListSeparatorDirective,
} from './directives';
export type {
  IVListCellContext,
  IVListItemContext,
  IVListSeparatorContext,
} from './directives';

export type {
  IVirtualizedListInputs,
  IVirtualizedListProps,
} from './list-props';

@Component({
  selector: 'VirtualizedList',
  standalone: true,
  hostDirectives: [
    { directive: SymbioteStyleInputDirective, inputs: ['style'] },
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [SymbioteHostPropsDirective, VListOutletDirective, ViewHost],
  providers: [
    {
      provide: ListScopeProvider,
      useExisting: forwardRef(() => VirtualizedList),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: VIRTUALIZED_LIST_TEMPLATE,
})
export class VirtualizedList<ItemT = unknown>
  extends VirtualizedListBagsBase<ItemT>
  implements
    IVirtualizedListInputs<ItemT>,
    ListScopeProvider,
    DoCheck,
    AfterViewChecked,
    OnDestroy
{
  // A template ref on a bare intrinsic hands back the host node directly
  @ViewChild('scrollHost', { read: ElementRef })
  private scrollHostRef?: ElementRef<unknown>;

  // The template holding a cell's item and separator, sits at the root so it resolves up front
  @ViewChild('cellBody', { static: true })
  private cellBody?: TemplateRef<unknown>;

  protected get scrollNode(): ISymbioteNode | null {
    const node = this.scrollHostRef?.nativeElement;
    return isSymbioteNode(node) ? node : null;
  }

  protected readonly scrollHandle: IScrollViewHandle = buildScrollViewHandle(
    () => this.scrollNode,
  );

  // The template tells a spacer row from a cell row by this, a bare literal would repeat per host
  protected readonly spacerKind = LIST_SEGMENT_KIND.spacer;

  // Template-bound view state, assembled by `recomputeView` in `ngDoCheck`
  itemCount = EMPTY_OFFSET;
  // The plan's spacers and cells in document order
  rows: IListRow<ItemT>[] = [];
  cellStyle: IViewStyle | undefined = undefined;
  headerStyle: IViewStyle | undefined = undefined;
  footerStyle: IViewStyle | undefined = undefined;

  // `renderVersion` bumps on every transition that changes render state, for the recompute dedup
  private readonly listState: IListState<ItemT> =
    createInitialListState<ItemT>();
  private renderVersion = EMPTY_OFFSET;

  private readonly cells = new CellRegistry<ItemT>({
    itemAt: index => this.getItem(this.data, index),
    itemCount: () => this.listState.metrics.count,
    isHorizontal: () => this.isHorizontal,
    markForCheck: () => this.cdr.markForCheck(),
    measured: (index, length, offset) =>
      this.dispatch({ kind: LIST_ACTION_KIND.measure, index, length, offset }),
  });

  private readonly effects = new ListEffectRunner<ItemT>({
    scrollToPixel: (offset, animated) => this.scrollToPixel(offset, animated),
    dispatch: action => this.dispatch(action),
    endReached: this.endReached,
    startReached: this.startReached,
    scrollToIndexFailed: this.scrollToIndexFailed,
  });

  private lastEffectSignature = '';
  // Without this dedup a rebuilt cell context reschedules another tick and the list free-runs
  private lastRecompute: unknown[] | undefined = undefined;

  private readonly cdr = inject(ChangeDetectorRef);
  // This component's own host, the anchor that `class="..."` at the use site resolves onto
  private readonly elementRef = inject(ElementRef);

  protected readonly keyFor = (index: number): string => {
    const item = this.getItem(this.data, index);
    return resolveItemKey(item, index, this.keyExtractor);
  };

  private readonly parentScope = injectVirtualizedListScope();
  private nestingMemo: IListNesting<ItemT> | undefined = undefined;

  // Built on first use, the inputs that pick its axis are set only after construction
  protected get nesting(): IListNesting<ItemT> {
    this.nestingMemo ??= createListNesting<ItemT>({
      parent: this.parentScope,
      horizontal: this.isHorizontal,
      getState: () => this.listState,
      dispatch: action => this.dispatch(action),
      getContainerNode: () => this.scrollNode,
      getHasMore: () => listHasMore(this.listState),
      keyFor: this.keyFor,
      handlers: () => this.listHandlers,
    });
    return this.nestingMemo;
  }

  // The scope the lists in this list's cells inject
  get listScope(): IListScope {
    return this.nesting.scope;
  }

  // Edge and viewability listeners map to `.observed`, so the reducer emits only if listened to
  private buildInputs(): IListReducerInputs<ItemT> {
    return {
      data: this.data,
      getItem: this.getItem,
      getItemCount: this.getItemCount,
      keyExtractor: this.keyExtractor,
      getItemLayout: this.getItemLayout,
      horizontal: this.isHorizontal,
      windowSize: this.windowSizeValue,
      disableVirtualization: this.disableVirtualization,
      initialNumToRender: this.initialNumToRenderValue,
      maxToRenderPerBatch: this.maxToRenderPerBatchValue,
      updateCellsBatchingPeriod: this.updateCellsBatchingPeriodValue,
      onEndReachedThreshold: this.onEndReachedThreshold,
      onStartReachedThreshold: this.onStartReachedThreshold,
      onEndReachedActive: this.endReached.observed,
      onStartReachedActive: this.startReached.observed,
      viewabilityPairs: buildViewabilityPairs(
        this.viewableItemsChanged.observed
          ? (info: IViewableItemsChangedInfo<ItemT>): void =>
              this.viewableItemsChanged.emit(info)
          : undefined,
        this.viewabilityConfig,
        this.viewabilityConfigCallbackPairs,
      ),
      maintainVisibleContentPosition: this.maintainVisibleContentPosition,
      initialScrollIndex: this.initialScrollIndex,
      findFirstChildWithMore: (first, last) =>
        this.nesting.findFirstChildWithMore(first, last),
    };
  }

  // Native callbacks fire outside Angular's bindings, so a changed state must mark the view dirty
  protected dispatch(action: IListAction<ItemT>): void {
    const inputs = this.buildInputs();
    const result = reduceList(this.listState, action, inputs);
    this.effects.run(result.effects, inputs);
    if (!result.changed) return;
    this.renderVersion += 1;
    if (this.isWindowSettled(action)) return;
    countAngular('listMarks');
    this.cdr.markForCheck();
  }

  // Asks whether a render would leave the window where it is, of the state as it is now
  // Comparing the last two rendered windows would read settled forever and the list goes deaf
  private isWindowSettled(action: IListAction<ItemT>): boolean {
    // A measurement rewrites the offset table the prediction reads
    if (action.kind === LIST_ACTION_KIND.measure) return false;
    const m = this.listState.metrics;
    // Mid-fill the window climbs one batch step per render, only a render advances it
    if (m.first !== m.target.first || m.last !== m.target.last) return false;
    const next = deriveWindow(
      this.listState,
      this.buildInputs(),
      m.count,
      m,
    ).target;
    const isSettled =
      next.first === m.target.first && next.last === m.target.last;
    if (!isSettled)
      dlog(
        `Angular VirtualizedList window moves [${m.first}, ${m.last}] -> ` +
          `[${next.first}, ${next.last}] at offset ${this.listState.scrollOffset}`,
      );
    return isSettled;
  }

  // Runs before the bindings are read, a later hook would trip the changed-after-checked guard
  ngDoCheck(): void {
    countAngular('listChecks');
    const recomputeInputs: unknown[] = [
      this.data,
      this.extraData,
      this.getItemLayout,
      this.keyExtractor,
      this.isHorizontal,
      this.isInverted,
      this.windowSizeValue,
      this.disableVirtualization,
      this.initialNumToRenderValue,
      this.maxToRenderPerBatchValue,
      this.stickyHeaderIndices,
      this.maintainVisibleContentPosition,
      this.style,
      // Arrives through `addClass` and `removeClass`, never as an input
      anchorHostStyle(this.elementRef),
      this.contentContainerStyle,
      this.listHeaderComponentStyle,
      this.listFooterComponentStyle,
      this.renderVersion,
      this.headerDir !== undefined,
      this.footerDir !== undefined,
      this.emptyDir !== undefined,
      this.separatorTemplate !== undefined,
      this.cellRendererTpl,
    ];
    const previous = this.lastRecompute;
    this.lastRecompute = recomputeInputs;
    if (
      previous !== undefined &&
      previous.length === recomputeInputs.length &&
      previous.every((value, index) => value === recomputeInputs[index])
    ) {
      return;
    }
    countAngular('listRecomputes');
    reduceList(
      this.listState,
      { kind: LIST_ACTION_KIND.refreshMetrics },
      this.buildInputs(),
    );
    this.recomputeView();
  }

  ngAfterViewChecked(): void {
    const signature = listEffectSignature(this.listState);
    if (signature === this.lastEffectSignature) return;
    this.lastEffectSignature = signature;
    const inputs = this.buildInputs();
    const result = reduceList(
      this.listState,
      { kind: LIST_ACTION_KIND.commit },
      inputs,
    );
    this.effects.run(result.effects, inputs);
  }

  ngOnDestroy(): void {
    this.effects.dispose();
    this.nestingMemo?.detach();
  }

  private recomputeView(): void {
    const m = this.listState.metrics;
    this.itemCount = m.count;
    this.applyStyles(m.total);
    this.cells.beginPass([
      this.data,
      this.extraData,
      this.getItem,
      this.keyExtractor,
    ]);
    if (m.count === FIRST_INDEX) {
      this.showEmpty();
      return;
    }
    this.rows = stampPlanRows({
      windowPlan: planFromMetrics(m, this.keyFor, this.stickyHeaderIndices),
      cells: this.cells,
      count: m.count,
      isHorizontal: this.isHorizontal,
      hasSeparators: this.separatorTemplate !== undefined,
      rendererFor: this.rendererFor(),
    });
    this.cells.endPass();
    dlog(
      `Angular VirtualizedList window [${m.first}, ${m.last}] of ${m.count} ` +
        `(offset=${this.listState.scrollOffset}, viewport=${this.listState.viewportLength}, rows=${this.rows.length})`,
    );
  }

  // Only a list given a `vListCell` template builds the wrapper contexts
  private rendererFor(): IRowsParams<ItemT>['rendererFor'] {
    if (this.cellRendererTpl === undefined) return undefined;
    return cell =>
      buildCellRendererContext({
        cell,
        style: this.cellStyle,
        body: this.cellBody,
        layout: (measure, event, index) =>
          this.handleCellLayout(measure, event, index),
        focus: index => this.handleCellFocus(index),
      });
  }

  private applyStyles(total: number): void {
    const styles = resolveListStyles({
      isHorizontal: this.isHorizontal,
      isInverted: this.isInverted,
      total,
      hasHeader: this.headerDir !== undefined,
      style: this.style,
      contentContainerStyle: this.contentContainerStyle,
      listHeaderComponentStyle: this.listHeaderComponentStyle,
      listFooterComponentStyle: this.listFooterComponentStyle,
      anchorStyle: anchorHostStyle(this.elementRef),
      maintainVisibleContentPosition: this.maintainVisibleContentPosition,
    });
    this.resolvedStyle = styles.style;
    this.resolvedContentContainerStyle = styles.contentContainerStyle;
    this.cellStyle = styles.cellStyle;
    this.headerStyle = styles.headerStyle;
    this.footerStyle = styles.footerStyle;
    this.resolvedMaintainVisibleContentPosition =
      styles.maintainVisibleContentPosition;
  }

  private showEmpty(): void {
    this.cells.clear();
    this.rows = [];
    dlog(
      `Angular VirtualizedList empty (viewport=${this.listState.viewportLength})`,
    );
  }

  // Angular forbids an `[onLayout]` binding, so the event arrives untyped and is narrowed here
  handleCellLayout(
    measure: (event: ISymbioteEvent) => void,
    event: unknown,
    index: number,
  ): void {
    if (!this.isSymbioteEvent(event)) return;
    measure(event);
    const cellKey = this.keyFor(index);
    this.nesting.scope.registerCellNode(event.currentTarget, cellKey);
    this.nesting.remeasureCell(cellKey);
  }

  // Focus inside a cell keeps a viewport of cells around it mounted, like RN's focus capture
  handleCellFocus(index: number): void {
    this.dispatch({ kind: LIST_ACTION_KIND.cellFocused, index });
  }

  private isSymbioteEvent(value: unknown): value is ISymbioteEvent {
    return (
      typeof value === 'object' && value !== null && 'nativeEvent' in value
    );
  }

  private scrollToPixel(offset: number, animated: boolean): void {
    const clamped = Math.max(EMPTY_OFFSET, offset);
    const target = this.isHorizontal
      ? { x: clamped, y: EMPTY_OFFSET }
      : { x: EMPTY_OFFSET, y: clamped };
    if (this.scrollNode !== null) {
      dlog(
        `Angular VirtualizedList scrollTo offset=${clamped} animated=${animated} (horizontal=${this.isHorizontal})`,
      );
      this.scrollHandle.scrollTo({ x: target.x, y: target.y, animated });
      return;
    }
    dlog(`Angular VirtualizedList scrollTo offset=${clamped} pending-ref`);
    this.commandedOffset = target;
    this.cdr.markForCheck();
  }
}
