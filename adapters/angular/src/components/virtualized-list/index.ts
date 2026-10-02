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
  inject,
  type AfterViewChecked,
  type DoCheck,
  type OnDestroy,
} from '@angular/core';
import {
  EMPTY_OFFSET,
  FIRST_INDEX,
  LIST_ACTION_KIND,
  buildListPlan,
  buildScrollViewHandle,
  buildViewabilityPairs,
  computeWindow,
  createInitialListState,
  listEffectSignature,
  reduceList,
  resolveItemKey,
  type IListAction,
  type IListReducerInputs,
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
import { CellRegistry, type IWindowCell } from './cell-registry';
import { VListOutletDirective } from './directives';
import { ListEffectRunner } from './list-effects';
import { VirtualizedListBagsBase } from './list-bags';
import type { IVirtualizedListInputs } from './list-props';
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
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListSeparatorDirective,
} from './directives';
export type { IVListItemContext, IVListSeparatorContext } from './directives';

type IListPlan = ReturnType<typeof buildListPlan>;

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
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: VIRTUALIZED_LIST_TEMPLATE,
})
export class VirtualizedList<ItemT = unknown>
  extends VirtualizedListBagsBase<ItemT>
  implements IVirtualizedListInputs<ItemT>, DoCheck, AfterViewChecked, OnDestroy
{
  // A template ref on a bare intrinsic hands back the host node directly
  @ViewChild('scrollHost', { read: ElementRef })
  private scrollHostRef?: ElementRef<unknown>;

  protected get scrollNode(): ISymbioteNode | null {
    const node = this.scrollHostRef?.nativeElement;
    return isSymbioteNode(node) ? node : null;
  }

  protected readonly scrollHandle: IScrollViewHandle = buildScrollViewHandle(
    () => this.scrollNode,
  );

  // Template-bound view state, assembled by `recomputeView` in `ngDoCheck`
  itemCount = EMPTY_OFFSET;
  windowCells: IWindowCell<ItemT>[] = [];
  // The nearest sticky cell mounted outside the window, `gapSpacerStyle` fills up to the window
  forcedStickyCell: IWindowCell<ItemT> | null = null;
  leadingSpacerStyle: IViewStyle | null = null;
  gapSpacerStyle: IViewStyle | null = null;
  trailingSpacerStyle: IViewStyle | null = null;
  cellStyle: IViewStyle | undefined = undefined;

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

  private keyFor = (index: number): string => {
    const item = this.getItem(this.data, index);
    return resolveItemKey(item, index, this.keyExtractor);
  };

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
    const next = computeWindow(
      m.count,
      m.offsets,
      m.lengths,
      this.listState.scrollOffset,
      this.listState.viewportLength,
      this.windowSizeValue,
      this.initialNumToRenderValue,
    );
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
      this.initialNumToRenderValue,
      this.maxToRenderPerBatchValue,
      this.stickyHeaderIndices,
      this.maintainVisibleContentPosition,
      this.style,
      // Arrives through `addClass` and `removeClass`, never as an input
      anchorHostStyle(this.elementRef),
      this.contentContainerStyle,
      this.renderVersion,
      this.headerDir !== undefined,
      this.footerDir !== undefined,
      this.emptyDir !== undefined,
      this.separatorTemplate !== undefined,
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
    const stickySet =
      this.stickyHeaderIndices !== undefined
        ? new Set(this.stickyHeaderIndices)
        : undefined;
    const plan = buildListPlan({
      count: m.count,
      first: m.first,
      last: m.last,
      offsets: m.offsets,
      lengths: m.lengths,
      total: m.total,
      keyFor: this.keyFor,
      stickyIndices: stickySet,
      hasHeader: this.headerDir !== undefined,
    });
    this.applySpacers(plan);
    this.buildCells(plan, stickySet);
    dlog(
      `Angular VirtualizedList window [${m.first}, ${m.last}] of ${m.count} ` +
        `(offset=${this.listState.scrollOffset}, viewport=${this.listState.viewportLength}, rendered=${this.windowCells.length})`,
    );
  }

  private applyStyles(total: number): void {
    const styles = resolveListStyles({
      isHorizontal: this.isHorizontal,
      isInverted: this.isInverted,
      total,
      hasHeader: this.headerDir !== undefined,
      style: this.style,
      contentContainerStyle: this.contentContainerStyle,
      anchorStyle: anchorHostStyle(this.elementRef),
      maintainVisibleContentPosition: this.maintainVisibleContentPosition,
    });
    this.resolvedStyle = styles.style;
    this.resolvedContentContainerStyle = styles.contentContainerStyle;
    this.cellStyle = styles.cellStyle;
    this.resolvedMaintainVisibleContentPosition =
      styles.maintainVisibleContentPosition;
  }

  private showEmpty(): void {
    this.cells.clear();
    this.windowCells = [];
    this.forcedStickyCell = null;
    this.leadingSpacerStyle = null;
    this.gapSpacerStyle = null;
    this.trailingSpacerStyle = null;
    dlog(
      `Angular VirtualizedList empty (viewport=${this.listState.viewportLength})`,
    );
  }

  private applySpacers(plan: IListPlan): void {
    this.leadingSpacerStyle = this.spacerStyle(plan.leadingExtent);
    this.gapSpacerStyle = this.spacerStyle(plan.gapExtent);
    this.trailingSpacerStyle = this.spacerStyle(plan.trailingExtent);
  }

  private spacerStyle(extent: number): IViewStyle | null {
    if (extent <= EMPTY_OFFSET) return null;
    return this.isHorizontal ? { width: extent } : { height: extent };
  }

  private buildCells(
    plan: IListPlan,
    stickySet: Set<number> | undefined,
  ): void {
    const count = this.listState.metrics.count;
    const forced = plan.forcedStickyCell;
    dlog(
      `STICKY[list] stickySet=${stickySet === undefined ? 'undefined' : JSON.stringify([...stickySet])} ` +
        `childPositions=${JSON.stringify(plan.stickyChildPositions)} ` +
        `forcedStickyCell=${forced === undefined ? 'none' : forced.index}`,
    );
    // Sticky by construction: a forced cell exists only for an index in `stickySet`
    this.forcedStickyCell =
      forced !== undefined
        ? this.cells.windowCell(forced.index, forced.key, false, true)
        : null;
    const hasSeparators = this.separatorTemplate !== undefined;
    // The separator gates on the last index of the data, not of the window, or a cell's height
    // would shift as it slides past
    this.windowCells = plan.cells.map(planned =>
      this.cells.windowCell(
        planned.index,
        planned.key,
        hasSeparators && planned.index < count - 1,
        stickySet?.has(planned.index) === true,
      ),
    );
    this.cells.endPass();
  }

  // Angular forbids an `[onLayout]` binding, so the event arrives untyped and is narrowed here
  handleCellLayout(
    measure: (event: ISymbioteEvent) => void,
    event: unknown,
  ): void {
    if (this.isSymbioteEvent(event)) measure(event);
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
