// VirtualizedSectionList flattens sections into one virtualized stream over VirtualizedList
// Flattening, entry keying and `scrollToLocation` are shared from `@symbiote-native/components`
// This file is the Angular lifecycle and the per-entry template dispatch

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChild,
  ElementRef,
  Input,
  ViewChild,
  inject,
  type DoCheck,
  type TemplateRef,
} from '@angular/core';
import {
  cellGapsFor,
  createSeparatorBoard,
  flattenSections,
  resolveStickySectionHeaders,
  resolveScrollLocation,
  SECTION_ENTRY_KIND,
  SEPARATOR_GAP_KIND,
  SEPARATOR_SIDE,
  sectionEntryKey,
  type IInnerViewRef,
  type ISectionEntry,
  type ISeparatorGap,
  type ISeparators,
  type IScrollViewHandle,
  type IVirtualizedSectionListHandle,
} from '@symbiote-native/components';
import {
  Platform,
  dlog,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  VirtualizedList,
  VListCellDirective,
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListSeparatorDirective,
  type IVListCellContext,
} from '../virtualized-list';
import { VListOutletDirective } from '../virtualized-list/directives';
import { ListEventsBase } from '../virtualized-list/list-events';
import { provideGateDemand } from '../../gate-demand';
import {
  stableAnchorStyle,
  SymbioteStyleInputDirective,
} from '../../primitives';
import {
  VSectionFooterDirective,
  VSectionHeaderDirective,
  VSectionItemDirective,
  VSectionSeparatorDirective,
  type ISection,
  type IVSectionContext,
  type IVSectionItemContext,
} from './directives';
import { VSectionCellDirective, type ISeparatorSlot } from './section-cell';
import type {
  IItemLayout,
  IVirtualizedSectionListInputs,
  IVirtualizedSectionListProps,
} from './section-list-props';
import { VIRTUALIZED_SECTION_LIST_TEMPLATE } from './section-list-template';

export type { IVirtualizedSectionListHandle } from '@symbiote-native/components';
export {
  VSectionFooterDirective,
  VSectionHeaderDirective,
  VSectionItemDirective,
  VSectionSeparatorDirective,
} from './directives';
export type {
  ISection,
  IVSectionContext,
  IVSectionItemContext,
  IVSectionSeparatorContext,
} from './directives';

type IEntry<ItemT> = ISectionEntry<ItemT, ISection<ItemT>>;

// Everything an item cell needs to paint itself, separators in painting order
export type ICellPlan<ItemT> = {
  cellKey: string;
  prevCellKey: string | undefined;
  hasLeading: boolean;
  hasTrailing: boolean;
  itemTemplate: TemplateRef<IVSectionItemContext<ItemT>> | undefined;
  first: ISeparatorSlot<ItemT>;
  second: ISeparatorSlot<ItemT>;
};

export type {
  IVirtualizedSectionListInputs,
  IVirtualizedSectionListProps,
} from './section-list-props';

@Component({
  selector: 'VirtualizedSectionList',
  standalone: true,
  viewProviders: [provideGateDemand(() => VirtualizedSectionList)],
  hostDirectives: [
    { directive: SymbioteStyleInputDirective, inputs: ['style'] },
  ],
  imports: [
    VirtualizedList,
    VListItemDirective,
    VListHeaderDirective,
    VListFooterDirective,
    VListEmptyDirective,
    VListOutletDirective,
    VSectionCellDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: VIRTUALIZED_SECTION_LIST_TEMPLATE,
})
export class VirtualizedSectionList<ItemT = unknown>
  extends ListEventsBase
  implements
    IVirtualizedSectionListInputs<ItemT>,
    IVirtualizedSectionListHandle,
    DoCheck
{
  @Input({ required: true }) sections!: ReadonlyArray<ISection<ItemT>>;
  @Input() keyExtractor?: (item: ItemT, index: number) => string;
  @Input() getItemLayout?: (
    data: ReadonlyArray<ISection<ItemT>> | null,
    index: number,
  ) => IItemLayout;
  @Input() stickySectionHeadersEnabled?: boolean;
  @Input() extraData?: unknown;
  @Input() onEndReachedThreshold?: number;
  @Input() onStartReachedThreshold?: number;
  @Input() refreshing?: boolean | null;
  @Input() progressViewOffset?: number;
  // The template always subscribes to the inner list's refresh to re-forward it, which keeps that
  // `.observed` true. `SectionList` passes its own public `refresh.observed` here instead
  @Input() refreshRequested?: boolean;
  @Input() initialNumToRender?: number;
  @Input() initialScrollIndex?: number;
  @Input() maxToRenderPerBatch?: number;
  @Input() updateCellsBatchingPeriod?: number;
  @Input() windowSize?: number;
  @Input() disableVirtualization?: boolean;
  @Input() inverted?: boolean;
  @Input() horizontal?: boolean;
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

  // A flat object bound to `[style]`, merged with this host's own class-derived style. A fresh
  // object per read would defeat the inner list's dedup gate, `stableAnchorStyle` keeps it steady
  private cachedResolvedStyle: Record<string, unknown> | undefined;
  get resolvedStyle(): IViewStyle {
    this.cachedResolvedStyle = stableAnchorStyle(
      this.elementRef,
      this.style,
      this.cachedResolvedStyle,
    );
    return this.cachedResolvedStyle;
  }

  // The section cell templates the app authors, stamped by the synthesized entry dispatch
  @ContentChild(VSectionItemDirective)
  sectionItemDir?: VSectionItemDirective<ItemT>;
  @ContentChild(VSectionHeaderDirective)
  sectionHeaderDir?: VSectionHeaderDirective<ItemT>;
  @ContentChild(VSectionFooterDirective)
  sectionFooterDir?: VSectionFooterDirective<ItemT>;
  @ContentChild(VSectionSeparatorDirective)
  sectionSeparatorDir?: VSectionSeparatorDirective<ItemT>;

  // List-level slots reuse the `VirtualizedList` directives and are forwarded to the inner list
  @ContentChild(VListHeaderDirective) listHeaderDir?: VListHeaderDirective;
  @ContentChild(VListFooterDirective) listFooterDir?: VListFooterDirective;
  @ContentChild(VListEmptyDirective) listEmptyDir?: VListEmptyDirective;
  @ContentChild(VListSeparatorDirective)
  itemSeparatorDir?: VListSeparatorDirective<ItemT>;
  // The cell wrapper, from projection or handed in by `SectionList`, the item is the list's entry
  @ContentChild(VListCellDirective) cellDir?: VListCellDirective;
  @Input() cellRendererTemplate?: TemplateRef<IVListCellContext>;

  get cellRendererTpl(): TemplateRef<IVListCellContext> | undefined {
    return this.cellRendererTemplate ?? this.cellDir?.templateRef;
  }

  // The inner list, whose instance is the scroll handle, reads lazily and no-ops before commit
  @ViewChild(VirtualizedList) private list?: VirtualizedList<IEntry<ItemT>>;

  // This component's own host, the anchor `class="..."` resolves onto, not the inner list's
  private readonly elementRef = inject(ElementRef);

  flatEntries: IEntry<ItemT>[] = [];
  stickyHeaderIndices: number[] | undefined = undefined;
  readonly board = createSeparatorBoard<Record<string, unknown>>();

  // Flat positions of every section header, so `scrollToLocation` skips re-deriving the layout
  private headerIndices: number[] = [];
  // Memo guard, the inner list marks for check on every scroll tick and re-runs `ngDoCheck`
  private lastSectionsRef: ReadonlyArray<ISection<ItemT>> | null = null;

  private readonly cdr = inject(ChangeDetectorRef);

  ngDoCheck(): void {
    if (this.sections === this.lastSectionsRef) return;
    this.lastSectionsRef = this.sections;

    const sections = this.sections ?? [];
    const { entries, headerIndices } = flattenSections<ItemT, ISection<ItemT>>(
      sections,
    );
    this.flatEntries = entries;
    this.headerIndices = headerIndices;

    // RN sticks section headers by default only on iOS
    this.stickyHeaderIndices = resolveStickySectionHeaders(
      this.stickySectionHeadersEnabled,
      headerIndices,
      Platform.OS,
    );

    dlog(
      `Angular VirtualizedSectionList: ${sections.length} sections flattened to ${entries.length} entries`,
    );
    this.cdr.markForCheck();
  }

  // Stable arrow fields, so the bindings to the inner list keep a constant identity
  getEntry = (_source: unknown, index: number): IEntry<ItemT> =>
    this.flatEntries[index];
  getEntryCount = (): number => this.flatEntries.length;
  entryKeyExtractor = (entry: IEntry<ItemT>): string =>
    sectionEntryKey(entry, this.keyExtractor);

  // RN hands the callback `sections`, not the flattened entries
  // Cached on the input's identity, the inner list folds it into its dedup array
  private cachedEntryItemLayout?: (data: unknown, index: number) => IItemLayout;
  private lastGetItemLayout?: IVirtualizedSectionListProps<ItemT>['getItemLayout'];
  get entryItemLayout():
    ((data: unknown, index: number) => IItemLayout) | undefined {
    if (this.getItemLayout !== this.lastGetItemLayout) {
      const getItemLayout = this.getItemLayout;
      this.lastGetItemLayout = getItemLayout;
      this.cachedEntryItemLayout =
        getItemLayout === undefined
          ? undefined
          : (_entries: unknown, index: number): IItemLayout =>
              getItemLayout(this.sections, index);
    }
    return this.cachedEntryItemLayout;
  }

  // Each output becomes the plain callback the inner list wants, or `undefined` when nobody
  // listens, since a callback's presence gates whether a `RefreshControl` is built downstream
  get resolvedOnEndReached():
    ((info: { distanceFromEnd: number }) => void) | undefined {
    return this.endReached.observed
      ? info => this.endReached.emit(info)
      : undefined;
  }

  get resolvedOnStartReached():
    ((info: { distanceFromStart: number }) => void) | undefined {
    return this.startReached.observed
      ? info => this.startReached.emit(info)
      : undefined;
  }

  get resolvedOnRefresh(): (() => void) | undefined {
    return this.refresh.observed ? () => this.refresh.emit() : undefined;
  }

  // The inner cell context is typed `unknown` under strict templates, so entries are narrowed
  private isEntry(value: unknown): value is IEntry<ItemT> {
    return typeof value === 'object' && value !== null && 'kind' in value;
  }

  entryKind(value: unknown): IEntry<ItemT>['kind'] | 'unknown' {
    return this.isEntry(value) ? value.kind : 'unknown';
  }

  sectionContextOf(value: unknown): IVSectionContext<ItemT> | undefined {
    if (!this.isEntry(value)) return undefined;
    if (value.kind !== 'header' && value.kind !== 'footer') return undefined;
    return { $implicit: value.section, section: value.section };
  }

  itemContextOf(
    value: unknown,
    separators: ISeparators,
  ): IVSectionItemContext<ItemT> | undefined {
    if (!this.isEntry(value) || value.kind !== 'item') return undefined;
    return {
      $implicit: value.item,
      item: value.item,
      index: value.itemIndex,
      section: value.section,
      separators,
    };
  }

  // The separator template for a gap: the section one, or the item one where a section's own
  // template beats the list's
  private slotFor(
    gap: ISeparatorGap<ItemT, ISection<ItemT>>,
    side: ISeparatorSlot<ItemT>['side'],
  ): ISeparatorSlot<ItemT> {
    if (gap.props === undefined) return { template: undefined, gap, side };
    const template =
      gap.kind === SEPARATOR_GAP_KIND.section
        ? this.sectionSeparatorDir?.templateRef
        : (gap.props.section.separator ?? this.itemSeparatorDir?.templateRef);
    return { template, gap, side };
  }

  cellPlanOf(value: unknown, index: number): ICellPlan<ItemT> | undefined {
    if (!this.isEntry(value) || value.kind !== SECTION_ENTRY_KIND.item)
      return undefined;
    const gaps = cellGapsFor(this.flatEntries, index);
    const leading = this.slotFor(gaps.leading, SEPARATOR_SIDE.leading);
    const trailing = this.slotFor(gaps.trailing, SEPARATOR_SIDE.trailing);
    const previous = this.flatEntries[index - 1];
    const isInverted = this.inverted === true;
    return {
      cellKey: this.entryKeyExtractor(value),
      prevCellKey:
        previous === undefined ? undefined : this.entryKeyExtractor(previous),
      hasLeading: leading.template !== undefined,
      hasTrailing: trailing.template !== undefined,
      itemTemplate: value.section.item ?? this.sectionItemDir?.templateRef,
      first: isInverted ? trailing : leading,
      second: isInverted ? leading : trailing,
    };
  }

  scrollToLocation(params: {
    sectionIndex: number;
    itemIndex: number;
    viewOffset?: number;
    viewPosition?: number;
    animated?: boolean;
  }): void {
    const target = resolveScrollLocation(
      this.headerIndices,
      this.stickyHeaderIndices,
      params,
    );
    if (target === undefined) {
      dlog(
        `Angular VirtualizedSectionList scrollToLocation: section ${params.sectionIndex} out of range`,
      );
      return;
    }
    dlog(
      `Angular VirtualizedSectionList scrollToLocation section=${params.sectionIndex} ` +
        `item=${params.itemIndex} -> flat ${target.index}`,
    );
    this.list?.scrollToIndex(target);
  }

  flashScrollIndicators(): void {
    this.list?.flashScrollIndicators();
  }

  getNativeScrollRef(): IScrollViewHandle | null {
    return this.list?.getNativeScrollRef() ?? null;
  }

  getScrollableNode(): IScrollViewHandle | null {
    return this.list?.getScrollableNode() ?? null;
  }

  getScrollResponder(): IScrollViewHandle | null {
    return this.list?.getScrollResponder() ?? null;
  }

  getScrollNode(): ISymbioteNode | null {
    return this.list?.getScrollNode() ?? null;
  }

  getScrollRef(): ISymbioteNode | null {
    return this.list?.getScrollRef() ?? null;
  }

  recordInteraction(): void {
    this.list?.recordInteraction();
  }

  setNativeProps(props: Record<string, unknown>): void {
    this.list?.setNativeProps(props);
  }
}
