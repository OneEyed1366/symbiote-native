// Sections flattened into one virtualized stream: header, items and footer per section
// Flattening, keying and `scrollToLocation` are shared, this file wires Solid's lifecycle

import { createMemo, splitProps, type Accessor, type Ref } from 'solid-js';
import type { JSX } from '../../jsx-runtime';
import {
  cellGapsFor,
  createSeparatorBoard,
  flattenSections,
  renderSectionEntry,
  resolveScrollLocation,
  resolveStickySectionHeaders,
  routeScrollHandle,
  SECTION_ENTRY_KIND,
  SEPARATOR_GAP_KIND,
  sectionEntryKey,
  type ISection as ICoreSection,
  type ISectionEntry,
  type ISeparatorBoard,
  type ISeparatorGap,
  type IAccessibilityProps,
  type IAriaProps,
  type IInnerViewRef,
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
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  VirtualizedList,
  type ICellRendererComponent,
  type IVirtualizedListCellInfo,
  type IVirtualizedListHandle,
} from '../virtualized-list';
import { SectionItemCell, type ISeparatorRender } from './section-item-cell';

export type { IVirtualizedSectionListHandle };

// A section may bring its own `renderItem` and `ItemSeparatorComponent`, which beat the list's
export type ISection<ItemT> = ICoreSection<ItemT> & {
  renderItem?: (info: Accessor<ISectionCellInfo<ItemT>>) => JSX.Element;
  ItemSeparatorComponent?: (props: ISeparatorProps<ItemT>) => JSX.Element;
};

// Section chrome arrives as an ACCESSOR, exactly like VirtualizedList's renderItem: a Solid
// component body runs once and there is no reconciler under the render prop, so a snapshot would
// freeze the header at its mount-time section (.claude/rules/solid-descriptor-bridge.md §4).
export type ISectionHeaderInfo<ItemT> = {
  section: ISection<ItemT>;
};

export type ISectionCellInfo<ItemT> = {
  item: ItemT;
  index: number;
  section: ISection<ItemT>;
  // RN's CellRenderer._separators, reaching the row unchanged: highlight/unhighlight/updateProps
  // drive the dividers flanking THIS row, which is how a pressed row paints a full-bleed divider.
  separators: ISeparators;
};

export type IVirtualizedSectionListProps<ItemT> = IAccessibilityProps &
  IAriaProps & {
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
    // A COMPONENT, not an element: it is instantiated once per section edge, and a JSX element
    // prop is a getter that builds ONE node, so reading it per edge would share that node
    SectionSeparatorComponent?: (props: ISeparatorProps<ItemT>) => JSX.Element;
    keyExtractor?: (item: ItemT, index: number) => string;
    // Painted between the items of one section, a section's own one beats it
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
    ListHeaderComponentStyle?: IStyleProp<IViewStyle>;
    ListFooterComponentStyle?: IStyleProp<IViewStyle>;
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
    // The cell's `item` is the list's own entry (an item, header or footer), not an `ItemT`
    CellRendererComponent?: ICellRendererComponent<unknown>;
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
    // A bare STRING resolves through the shared style registry too, matching this adapter's own
    // VirtualizedList and ScrollView (React's contentContainerStyle is style-object-only).
    contentContainerStyle?: IStyleProp<IViewStyle> | string;
    // Solid's spelling for a registered class name (React's is `className`).
    class?: IClassNameValue;
  };

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

type IEntry<ItemT> = ISectionEntry<ItemT, ISection<ItemT>>;

type ICellInfoAccessor<ItemT> = Accessor<
  IVirtualizedListCellInfo<IEntry<ItemT>>
>;

// Every entry kind carries its section, so a row whose index briefly points at a neighbour
// still reads a valid one
function sectionInfoOf<ItemT>(
  info: ICellInfoAccessor<ItemT>,
): Accessor<ISectionHeaderInfo<ItemT>> {
  return createMemo(() => ({ section: info().item.section }));
}

function cellInfoOf<ItemT>(
  info: ICellInfoAccessor<ItemT>,
  initial: ISectionCellInfo<ItemT>,
): Accessor<ISectionCellInfo<ItemT>> {
  return createMemo((previous: ISectionCellInfo<ItemT>) => {
    const entry = info().item;
    if (entry.kind !== SECTION_ENTRY_KIND.item) return previous;
    return {
      item: entry.item,
      index: entry.itemIndex,
      section: entry.section,
      separators: initial.separators,
    };
  }, initial);
}

type IEntryRendering<ItemT> = {
  props: IVirtualizedSectionListProps<ItemT>;
  entries: Accessor<IEntry<ItemT>[]>;
  board: ISeparatorBoard<Record<string, unknown>>;
  keyOf: (entry: IEntry<ItemT>) => string;
};

// The separator for a gap: the section one, or the item one where a section's own beats the list's
function separatorRenderFor<ItemT>(
  gap: ISeparatorGap<ItemT, ISection<ItemT>>,
  props: IVirtualizedSectionListProps<ItemT>,
): ISeparatorRender | undefined {
  if (gap.props === undefined) return undefined;
  const gapProps = gap.props;
  const Separator =
    gap.kind === SEPARATOR_GAP_KIND.section
      ? props.SectionSeparatorComponent
      : (gapProps.section.ItemSeparatorComponent ??
        props.ItemSeparatorComponent);
  if (Separator === undefined) return undefined;
  return ({ isHighlighted, override }) => (
    <Separator highlighted={isHighlighted} {...gapProps} {...override} />
  );
}

// An item entry becomes a cell that paints its own separators around the row
function itemCellFor<ItemT>(
  rendering: IEntryRendering<ItemT>,
  info: ICellInfoAccessor<ItemT>,
  entry: Extract<IEntry<ItemT>, { kind: typeof SECTION_ENTRY_KIND.item }>,
): JSX.Element {
  const { props, entries, keyOf } = rendering;
  const gaps = createMemo(() => cellGapsFor(entries(), info().index));
  const renderItem = entry.section.renderItem ?? props.renderItem;
  return (
    <SectionItemCell
      board={rendering.board}
      cellKey={createMemo(() => keyOf(info().item))}
      prevCellKey={createMemo(() => {
        const previous = entries()[info().index - 1];
        return previous === undefined ? undefined : keyOf(previous);
      })}
      renderItem={separators =>
        renderItem(
          cellInfoOf(info, {
            item: entry.item,
            index: entry.itemIndex,
            section: entry.section,
            separators,
          }),
        )
      }
      leadingSeparator={createMemo(() =>
        separatorRenderFor(gaps().leading, props),
      )}
      trailingSeparator={createMemo(() =>
        separatorRenderFor(gaps().trailing, props),
      )}
      isInverted={props.inverted === true}
    />
  );
}

// Called once per cell, `buildCell` of `VirtualizedList` already untracks it
function entryRendererFor<ItemT>(
  rendering: IEntryRendering<ItemT>,
): (info: ICellInfoAccessor<ItemT>) => JSX.Element {
  const { props } = rendering;
  return info =>
    renderSectionEntry<ItemT, JSX.Element, ISection<ItemT>>(
      {
        header: () => props.renderSectionHeader?.(sectionInfoOf(info)),
        footer: () => props.renderSectionFooter?.(sectionInfoOf(info)),
        item: entry => itemCellFor(rendering, info, entry),
      },
      info().item,
    );
}

type IScrollLocationParams = Parameters<
  IVirtualizedSectionListHandle['scrollToLocation']
>[0];

// This handle adds the (section, item) to flat index resolution over the list's own handle
// The rest routes straight through the shared `IScrollRoutingHandle` tail
function buildSectionHandle(
  getInner: () => IVirtualizedListHandle | undefined,
  locate: (
    params: IScrollLocationParams,
  ) => ReturnType<typeof resolveScrollLocation>,
): IVirtualizedSectionListHandle {
  return {
    scrollToLocation: (params): void => {
      const target = locate(params);
      if (target === undefined) {
        dlog(
          `VirtualizedSectionList scrollToLocation: section ${params.sectionIndex} out of range`,
        );
        return;
      }
      dlog(
        `VirtualizedSectionList scrollToLocation section=${params.sectionIndex} ` +
          `item=${params.itemIndex} -> flat ${target.index}`,
      );
      getInner()?.scrollToIndex(target);
    },
    ...routeScrollHandle(getInner),
  };
}

export function VirtualizedSectionList<ItemT>(
  props: IVirtualizedSectionListProps<ItemT>,
): JSX.Element {
  const [, listRest] = splitProps(props, HANDLED_PROPS);

  const flattened = createMemo(() =>
    flattenSections<ItemT, ISection<ItemT>>(props.sections),
  );
  const entries = (): IEntry<ItemT>[] => flattened().entries;
  // RN sticks section headers by default only on iOS; Android does not unless asked. The
  // headerIndices are the flat positions of every section header, which the inner list wraps.
  const stickyHeaderIndices = (): number[] | undefined =>
    resolveStickySectionHeaders(
      props.stickySectionHeadersEnabled,
      flattened().headerIndices,
      Platform.OS,
    );

  // The inner list, held by identity in a plain variable
  let inner: IVirtualizedListHandle | undefined;
  const handle = buildSectionHandle(
    () => inner,
    params =>
      resolveScrollLocation(
        flattened().headerIndices,
        stickyHeaderIndices(),
        params,
      ),
  );
  if (typeof props.ref === 'function') props.ref(handle);

  // Section chrome keys off its section and never reaches the user's extractor, typed on ItemT
  const entryKeyExtractor = (entry: IEntry<ItemT>): string =>
    sectionEntryKey(entry, props.keyExtractor);
  const renderEntry = entryRendererFor({
    props,
    entries,
    board: createSeparatorBoard<Record<string, unknown>>(),
    keyOf: entryKeyExtractor,
  });

  return (
    <VirtualizedList<IEntry<ItemT>>
      {...listRest}
      data={entries()}
      getItem={(_source: unknown, index: number): IEntry<ItemT> =>
        entries()[index]
      }
      getItemCount={(): number => entries().length}
      renderItem={renderEntry}
      stickyHeaderIndices={stickyHeaderIndices()}
      keyExtractor={entryKeyExtractor}
      ref={list => {
        inner = list;
      }}
    />
  );
}
