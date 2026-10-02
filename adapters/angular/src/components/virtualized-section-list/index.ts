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
} from '@angular/core';
import {
  flattenSections,
  resolveStickySectionHeaders,
  scrollLocationToFlatIndex,
  sectionEntryKey,
  unwrapEntryItem,
  type IAccessibilityProps,
  type IAriaProps,
  type ISection,
  type ISectionEntry,
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
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListSeparatorDirective,
  type IVListSeparatorContext,
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
  type IVSectionContext,
  type IVSectionItemContext,
} from './directives';
import { VIRTUALIZED_SECTION_LIST_TEMPLATE } from './section-list-template';

export type { ISection } from '@symbiote-native/components';
export type { IVirtualizedSectionListHandle } from '@symbiote-native/components';
export {
  VSectionFooterDirective,
  VSectionHeaderDirective,
  VSectionItemDirective,
  VSectionSeparatorDirective,
} from './directives';
export type { IVSectionContext, IVSectionItemContext } from './directives';

type IItemLayout = { length: number; offset: number; index: number };

// The React and Vue surface minus element-returning props, which are `<ng-template>` here
export interface IVirtualizedSectionListProps<ItemT>
  extends IAccessibilityProps, IAriaProps {
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
  removeClippedSubviews?: boolean;
  nestedScrollEnabled?: boolean;
  style?: IStyleProp<IViewStyle>;
  contentContainerStyle?: IStyleProp<IViewStyle>;
}

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
    VListSeparatorDirective,
    VListOutletDirective,
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
  @Input() inverted?: boolean;
  @Input() maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  @Input() onScroll?: (event: ISymbioteEvent) => void;
  @Input() onScrollBeginDrag?: (event: ISymbioteEvent) => void;
  @Input() onScrollEndDrag?: (event: ISymbioteEvent) => void;
  @Input() onMomentumScrollBegin?: (event: ISymbioteEvent) => void;
  @Input() onMomentumScrollEnd?: (event: ISymbioteEvent) => void;
  @Input() scrollEventThrottle?: number;
  @Input() keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  @Input() keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  @Input() removeClippedSubviews?: boolean;
  @Input() nestedScrollEnabled?: boolean;
  @Input() style?: IStyleProp<IViewStyle>;
  @Input() contentContainerStyle?: IStyleProp<IViewStyle>;
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
  sectionSeparatorDir?: VSectionSeparatorDirective;

  // List-level slots reuse the `VirtualizedList` directives and are forwarded to the inner list
  @ContentChild(VListHeaderDirective) listHeaderDir?: VListHeaderDirective;
  @ContentChild(VListFooterDirective) listFooterDir?: VListFooterDirective;
  @ContentChild(VListEmptyDirective) listEmptyDir?: VListEmptyDirective;
  @ContentChild(VListSeparatorDirective)
  itemSeparatorDir?: VListSeparatorDirective<ItemT>;

  // The inner list, whose instance is the scroll handle, reads lazily and no-ops before commit
  @ViewChild(VirtualizedList) private list?: VirtualizedList<
    ISectionEntry<ItemT>
  >;

  // This component's own host, the anchor `class="..."` resolves onto, not the inner list's
  private readonly elementRef = inject(ElementRef);

  flatEntries: ISectionEntry<ItemT>[] = [];
  stickyHeaderIndices: number[] | undefined = undefined;

  // Flat positions of every section header, so `scrollToLocation` skips re-deriving the layout
  private headerIndices: number[] = [];
  // Memo guards, the inner list marks for check on every scroll tick and re-runs `ngDoCheck`
  private lastSectionsRef: ReadonlyArray<ISection<ItemT>> | null = null;
  private lastHasSectionSeparator = false;

  private readonly cdr = inject(ChangeDetectorRef);

  ngDoCheck(): void {
    const hasSectionSeparator = this.sectionSeparatorDir !== undefined;
    if (
      this.sections === this.lastSectionsRef &&
      hasSectionSeparator === this.lastHasSectionSeparator
    ) {
      return;
    }
    this.lastSectionsRef = this.sections;
    this.lastHasSectionSeparator = hasSectionSeparator;

    const sections = this.sections ?? [];
    const { entries, headerIndices } = flattenSections(
      sections,
      hasSectionSeparator,
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
  getEntry = (_source: unknown, index: number): ISectionEntry<ItemT> =>
    this.flatEntries[index];
  getEntryCount = (): number => this.flatEntries.length;
  entryKeyExtractor = (entry: ISectionEntry<ItemT>, index: number): string =>
    sectionEntryKey(entry, index, this.keyExtractor);

  // RN hands the callback `sections`, not the flattened entries. The flat index matches RN's only
  // while no section separator template is set, which adds one row per boundary here
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
  private isEntry(value: unknown): value is ISectionEntry<ItemT> {
    return typeof value === 'object' && value !== null && 'kind' in value;
  }

  entryKind(value: unknown): ISectionEntry<ItemT>['kind'] | 'unknown' {
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

  // The inner separator context carries flattened entries, unwrapped back to real items so the
  // app's separator, typed on the item, never sees an envelope
  itemSeparatorContextOf(
    highlighted: unknown,
    leadingItem: unknown,
    trailingItem: unknown,
  ): IVListSeparatorContext<ItemT> {
    return {
      $implicit: highlighted === true,
      highlighted: highlighted === true,
      leadingItem: this.isEntry(leadingItem)
        ? unwrapEntryItem(leadingItem)
        : undefined,
      trailingItem: this.isEntry(trailingItem)
        ? unwrapEntryItem(trailingItem)
        : undefined,
    };
  }

  scrollToLocation(params: {
    sectionIndex: number;
    itemIndex: number;
    viewOffset?: number;
    viewPosition?: number;
    animated?: boolean;
  }): void {
    const flatIndex = scrollLocationToFlatIndex(
      this.headerIndices,
      params.sectionIndex,
      params.itemIndex,
    );
    if (flatIndex === undefined) {
      dlog(
        `Angular VirtualizedSectionList scrollToLocation: section ${params.sectionIndex} out of range`,
      );
      return;
    }
    dlog(
      `Angular VirtualizedSectionList scrollToLocation section=${params.sectionIndex} ` +
        `item=${params.itemIndex} -> flat ${flatIndex}`,
    );
    this.list?.scrollToIndex({
      index: flatIndex,
      viewOffset: params.viewOffset,
      viewPosition: params.viewPosition,
      animated: params.animated,
    });
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

  recordInteraction(): void {
    this.list?.recordInteraction();
  }
}
