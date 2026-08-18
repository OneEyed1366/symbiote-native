// VirtualizedSectionList: sections flattened into one virtualized stream. Each section contributes
// a header row, its item rows, then a footer row; the flattened tagged sequence feeds
// VirtualizedList as a single list, so headers, items and footers are windowed by the same
// machinery. The flattening, entry keying, separator-item unwrap and scrollToLocation mapping are
// shared verbatim from @symbiote-native/components; this file wires only Solid's lifecycle.

import { createMemo, splitProps, type Accessor, type Ref } from 'solid-js';
import type { JSX } from '../../jsx-runtime';
import {
  flattenSections,
  resolveStickySectionHeaders,
  scrollLocationToFlatIndex,
  sectionEntryKey,
  unwrapEntryItem,
  type ISection,
  type ISectionEntry,
  type IAccessibilityProps,
  type IAriaProps,
  type ISeparatorProps,
  type ISeparators,
  type IVirtualizedSectionListHandle,
} from '@symbiote-native/components';
import {
  Platform,
  dlog,
  type IClassNameValue,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  VirtualizedList,
  type IVirtualizedListCellInfo,
  type IVirtualizedListHandle,
} from '../virtualized-list';
import type { IScrollViewHandle } from '../scroll-view';

export type { ISection, IVirtualizedSectionListHandle };

// Section chrome arrives as an ACCESSOR, exactly like VirtualizedList's renderItem: a Solid
// component body runs once and there is no reconciler under the render prop, so a snapshot would
// freeze the header at its mount-time section (.claude/rules/solid-descriptor-bridge.md §4).
export interface ISectionHeaderInfo<ItemT> {
  section: ISection<ItemT>;
}

export interface ISectionCellInfo<ItemT> {
  item: ItemT;
  index: number;
  section: ISection<ItemT>;
  // RN's CellRenderer._separators, reaching the row unchanged: highlight/unhighlight/updateProps
  // drive the dividers flanking THIS row, which is how a pressed row paints a full-bleed divider.
  separators: ISeparators;
}

export interface IVirtualizedSectionListProps<ItemT>
  extends IAccessibilityProps, IAriaProps {
  sections: ReadonlyArray<ISection<ItemT>>;
  renderItem: (info: Accessor<ISectionCellInfo<ItemT>>) => JSX.Element;
  renderSectionHeader?: (
    info: Accessor<ISectionHeaderInfo<ItemT>>,
  ) => JSX.Element;
  renderSectionFooter?: (
    info: Accessor<ISectionHeaderInfo<ItemT>>,
  ) => JSX.Element;
  // Stick each section header to the top as the next section scrolls up. Defaults to
  // `Platform.OS === 'ios'` (RN SectionList.js); Android does not stick unless asked.
  stickySectionHeadersEnabled?: boolean;
  // A COMPONENT, not an element: it is instantiated once per between-sections gap, and a JSX
  // element prop is a getter that builds ONE node — reading it per gap would hand the same node to
  // several positions. The RN twin is SectionSeparatorComponent.
  SectionSeparatorComponent?: () => JSX.Element;
  keyExtractor?: (item: ItemT, index: number) => string;
  // Painted in the gap after each rendered cell, the inner list's own ItemSeparatorComponent — but
  // typed on ItemT, so each side is unwrapped out of the entry wrapper before it gets here.
  ItemSeparatorComponent?: (props: ISeparatorProps<ItemT>) => JSX.Element;
  // The imperative handle, NOT the host node — the same thing React exposes through
  // useImperativeHandle. Solid's compiler turns `ref={list}` on a component into a callback prop.
  ref?: Ref<IVirtualizedSectionListHandle>;
  // Everything below is VirtualizedList's own surface, declared here so consumers get typed props;
  // at runtime it rides down through the `rest` spread untouched.
  //
  // Elements, not components, exactly as VirtualizedList takes them: each is read ONCE, because a
  // JSX prop is a getter that BUILDS the element on read.
  ListHeaderComponent?: JSX.Element;
  ListFooterComponent?: JSX.Element;
  ListEmptyComponent?: JSX.Element;
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
  style?: IStyleProp<IViewStyle>;
  // A bare STRING resolves through the shared style registry too, matching this adapter's own
  // VirtualizedList and ScrollView (React's contentContainerStyle is style-object-only).
  contentContainerStyle?: IStyleProp<IViewStyle> | string;
  // Solid's spelling for a registered class name (React's is `className`).
  class?: IClassNameValue;
}

// Consumed by this layer; everything LEFT OVER is VirtualizedList's own surface (the scroll host,
// the list chrome, the windowing knobs, the accessibility props) and rides down untouched, exactly
// as React's VirtualizedSectionList spreads its `...rest` onto the inner list.
const HANDLED_PROPS = [
  'sections',
  'renderItem',
  'renderSectionHeader',
  'renderSectionFooter',
  'SectionSeparatorComponent',
  'ItemSeparatorComponent',
  'keyExtractor',
  'stickySectionHeadersEnabled',
  'ref',
] as const;

export function VirtualizedSectionList<ItemT>(
  props: IVirtualizedSectionListProps<ItemT>,
): JSX.Element {
  const [, listRest] = splitProps(props, HANDLED_PROPS);

  const flattened = createMemo(() =>
    flattenSections(
      props.sections,
      props.SectionSeparatorComponent !== undefined,
    ),
  );
  const entries = (): ISectionEntry<ItemT>[] => flattened().entries;
  // RN sticks section headers by default only on iOS; Android does not unless asked. The
  // headerIndices are the flat positions of every section header, which the inner list wraps.
  const stickyHeaderIndices = (): number[] | undefined =>
    resolveStickySectionHeaders(
      props.stickySectionHeadersEnabled,
      flattened().headerIndices,
      Platform.OS,
    );

  // The entry under a row keeps its KIND for as long as the row lives — sectionEntryKey namespaces
  // header/footer/separator keys away from item keys, so <For> never hands a row an entry of a
  // different kind. `previous` covers only the tick where new sections have landed but the row has
  // not been disposed yet, during which the row's index can point at a neighbouring entry.
  function sectionInfo(
    info: Accessor<IVirtualizedListCellInfo<ISectionEntry<ItemT>>>,
    initial: ISection<ItemT>,
  ): Accessor<ISectionHeaderInfo<ItemT>> {
    return createMemo(
      (previous: ISectionHeaderInfo<ItemT>) => {
        const entry = info().item;
        return entry.kind === 'section-separator'
          ? previous
          : { section: entry.section };
      },
      { section: initial },
    );
  }

  function cellInfo(
    info: Accessor<IVirtualizedListCellInfo<ISectionEntry<ItemT>>>,
    initial: ISectionCellInfo<ItemT>,
  ): Accessor<ISectionCellInfo<ItemT>> {
    return createMemo((previous: ISectionCellInfo<ItemT>) => {
      const entry = info().item;
      if (entry.kind !== 'item') return previous;
      return {
        item: entry.item,
        index: entry.itemIndex,
        section: entry.section,
        separators: info().separators,
      };
    }, initial);
  }

  // The inner list, held by identity in a plain variable: everything this handle adds over
  // VirtualizedList's own is the (section, item) -> flat index resolution, and the rest routes
  // straight through — the shared IScrollRoutingHandle tail both list handles extend.
  let inner: IVirtualizedListHandle | undefined;

  const handle: IVirtualizedSectionListHandle = {
    scrollToLocation: (params: {
      sectionIndex: number;
      itemIndex: number;
      viewOffset?: number;
      viewPosition?: number;
      animated?: boolean;
    }): void => {
      const flatIndex = scrollLocationToFlatIndex(
        flattened().headerIndices,
        params.sectionIndex,
        params.itemIndex,
      );
      if (flatIndex === undefined) {
        dlog(
          `VirtualizedSectionList scrollToLocation: section ${params.sectionIndex} out of range`,
        );
        return;
      }
      dlog(
        `VirtualizedSectionList scrollToLocation section=${params.sectionIndex} ` +
          `item=${params.itemIndex} -> flat ${flatIndex}`,
      );
      inner?.scrollToIndex({
        index: flatIndex,
        viewOffset: params.viewOffset,
        viewPosition: params.viewPosition,
        animated: params.animated,
      });
    },
    flashScrollIndicators: (): void => {
      inner?.flashScrollIndicators();
    },
    getNativeScrollRef: (): IScrollViewHandle | null =>
      inner?.getNativeScrollRef() ?? null,
    getScrollableNode: (): IScrollViewHandle | null =>
      inner?.getScrollableNode() ?? null,
    getScrollResponder: (): IScrollViewHandle | null =>
      inner?.getScrollResponder() ?? null,
    getScrollNode: (): ISymbioteNode | null => inner?.getScrollNode() ?? null,
    recordInteraction: (): void => {
      inner?.recordInteraction();
    },
  };
  if (typeof props.ref === 'function') props.ref(handle);

  // Section chrome keys off its section (and never reaches the user's extractor, which is typed on
  // ItemT); an item keys off the user's extractor with its index INSIDE its section.
  function entryKeyExtractor(
    entry: ISectionEntry<ItemT>,
    index: number,
  ): string {
    return sectionEntryKey(entry, index, props.keyExtractor);
  }

  function entrySeparatorProps(
    entryProps: ISeparatorProps<ISectionEntry<ItemT>>,
  ): ISeparatorProps<ItemT> {
    return {
      ...entryProps,
      leadingItem: unwrapEntryItem(entryProps.leadingItem),
      trailingItem: unwrapEntryItem(entryProps.trailingItem),
    };
  }

  // The user's separator is typed on ItemT while the inner stream carries the entry wrapper, so
  // each side is unwrapped back to its item — undefined for a gap next to section chrome, which has
  // no item on that side.
  const entrySeparatorComponent = createMemo(() => {
    const ItemSeparator = props.ItemSeparatorComponent;
    if (ItemSeparator === undefined) return undefined;
    // ONE bag, not a spread plus two overriding attributes: Solid's mergeProps resolves a key by
    // scanning its sources back to front and taking the first NON-undefined value, so an override
    // that unwraps to `undefined` (every gap next to section chrome) falls back to the raw entry
    // instead of clearing it, and the user's `leadingItem` reads as the wrapper object. Building the
    // whole bag in one function keeps a single source — and, being a spread of a CALL, it compiles
    // to mergeProps(() => …) so the separator's props stay live.
    return (entryProps: ISeparatorProps<ISectionEntry<ItemT>>): JSX.Element => (
      <ItemSeparator {...entrySeparatorProps(entryProps)} />
    );
  });

  // Called ONCE per cell and already untracked by VirtualizedList's buildCell.
  function renderEntry(
    info: Accessor<IVirtualizedListCellInfo<ISectionEntry<ItemT>>>,
  ): JSX.Element {
    const entry = info().item;
    if (entry.kind === 'header') {
      const header = props.renderSectionHeader;
      return header === undefined
        ? undefined
        : header(sectionInfo(info, entry.section));
    }
    if (entry.kind === 'footer') {
      const footer = props.renderSectionFooter;
      return footer === undefined
        ? undefined
        : footer(sectionInfo(info, entry.section));
    }
    if (entry.kind === 'section-separator') {
      const SectionSeparator = props.SectionSeparatorComponent;
      return SectionSeparator === undefined ? undefined : <SectionSeparator />;
    }
    return props.renderItem(
      cellInfo(info, {
        item: entry.item,
        index: entry.itemIndex,
        section: entry.section,
        separators: info().separators,
      }),
    );
  }

  return (
    <VirtualizedList<ISectionEntry<ItemT>>
      {...listRest}
      data={entries()}
      getItem={(_source: unknown, index: number): ISectionEntry<ItemT> =>
        entries()[index]
      }
      getItemCount={(): number => entries().length}
      renderItem={renderEntry}
      stickyHeaderIndices={stickyHeaderIndices()}
      keyExtractor={entryKeyExtractor}
      ItemSeparatorComponent={entrySeparatorComponent()}
      ref={list => {
        inner = list;
      }}
    />
  );
}
