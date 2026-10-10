// SectionList logic: the framework-agnostic section flattening over VirtualizedList. Each
// section contributes a header row, its item rows, then a footer row (RN counts 2 per
// section around the items); the flattened sequence feeds VirtualizedList as one tagged
// stream, so headers, items, and footers are windowed by the same machinery. All of this
// is pure transform - every adapter reuses it; the adapter supplies only the per-entry
// element creation (renderSectionHeader / renderItem / etc.) and the ref wiring.

import { defaultKeyExtractor } from './virtualized-list';
import type { IScrollRoutingHandle } from './scroll-routing-handle';

export type ISection<ItemT> = {
  title: string;
  data: readonly ItemT[];
  // A stable identity for this section (`VirtualizedSectionList.js`'s `section.key`), used ahead
  // of its position for the header/footer/item keys below. Falls back to the section's index when
  // absent, exactly like an item's own key falls back to its index.
  key?: string;
  // Overrides the list-wide `keyExtractor` for this section's own items
  // (`VirtualizedSectionList.js:305` — `section.keyExtractor || keyExtractor || defaultKeyExtractor`).
  // Method-shorthand, not a property of function type: `ISection<ItemT>` flows into Angular's
  // generic template-context types (`directives.ts`'s `IVSectionContext`), and a property-typed
  // callback is checked CONTRAVARIANTLY under `strictFunctionTypes`, which made `ISection<unknown>`
  // (what Angular's template type-checker substitutes when proving a directive generic-safe) fail
  // to assign to `ISection<ItemT>` — a real ngtsc compile error, not a template-authoring one.
  // Method shorthand is checked bivariantly instead, which is what every other generic template
  // context in this adapter relies on.
  keyExtractor?(item: ItemT, index: number): string;
};

// Separators are no cells of their own: an item cell paints them around itself, as RN's
// `ItemWithSeparator` does, so the entry carries its neighbours
type ISectionNeighbours<SectionT> = {
  section: SectionT;
  sectionIndex: number;
  leadingSection: SectionT | undefined;
  trailingSection: SectionT | undefined;
};

// `SectionT` is the app's own section type: an adapter adds `renderItem` / `ItemSeparatorComponent`
export type ISectionEntry<
  ItemT,
  SectionT extends ISection<ItemT> = ISection<ItemT>,
> =
  | ({ kind: 'header' } & ISectionNeighbours<SectionT>)
  | ({
      kind: 'item';
      item: ItemT;
      itemIndex: number;
      leadingItem: ItemT | undefined;
      trailingItem: ItemT | undefined;
    } & ISectionNeighbours<SectionT>)
  | ({ kind: 'footer' } & ISectionNeighbours<SectionT>);

export const SECTION_ENTRY_KIND = {
  header: 'header',
  item: 'item',
  footer: 'footer',
} as const;

type IEntryOfKind<
  ItemT,
  SectionT extends ISection<ItemT>,
  K extends ISectionEntry<ItemT, SectionT>['kind'],
> = Extract<ISectionEntry<ItemT, SectionT>, { kind: K }>;

// One renderer per entry kind, the inner list streams all three through a single `renderItem`
export type ISectionEntryRenderers<
  ItemT,
  TNode,
  SectionT extends ISection<ItemT> = ISection<ItemT>,
> = {
  header(entry: IEntryOfKind<ItemT, SectionT, 'header'>): TNode;
  item(entry: IEntryOfKind<ItemT, SectionT, 'item'>): TNode;
  footer(entry: IEntryOfKind<ItemT, SectionT, 'footer'>): TNode;
};

// The dispatch every adapter's entry renderer shares, only what each kind renders differs
export function renderSectionEntry<
  ItemT,
  TNode,
  SectionT extends ISection<ItemT> = ISection<ItemT>,
>(
  renderers: ISectionEntryRenderers<ItemT, TNode, SectionT>,
  entry: ISectionEntry<ItemT, SectionT>,
): TNode {
  switch (entry.kind) {
    case SECTION_ENTRY_KIND.header:
      return renderers.header(entry);
    case SECTION_ENTRY_KIND.footer:
      return renderers.footer(entry);
    case SECTION_ENTRY_KIND.item:
      return renderers.item(entry);
  }
}

// The imperative API RN exposes on a SectionList ref. scrollToLocation is this handle's
// own primary member: it resolves a (sectionIndex, itemIndex) coordinate to the flattened
// entry index and forwards to the inner VirtualizedList's scrollToIndex. The
// flash/scroll-ref/interaction tail is the inner-scroll routing shared with
// VirtualizedList (see IScrollRoutingHandle) - extending it, rather than re-declaring it,
// is what keeps the two handle types from drifting from each other.
export type IVirtualizedSectionListHandle = IScrollRoutingHandle & {
  scrollToLocation(params: {
    sectionIndex: number;
    itemIndex: number;
    viewOffset?: number;
    viewPosition?: number;
    animated?: boolean;
  }): void;
};

// Flatten sections into entries AND record where each section header lands in the flat
// stream, so scrollToLocation can map (sectionIndex, itemIndex) -> flat index without
// re-deriving the layout
export function flattenSections<
  ItemT,
  SectionT extends ISection<ItemT> = ISection<ItemT>,
>(
  sections: ReadonlyArray<SectionT & ISection<ItemT>>,
): { entries: ISectionEntry<ItemT, SectionT>[]; headerIndices: number[] } {
  const entries: ISectionEntry<ItemT, SectionT>[] = [];
  const headerIndices: number[] = [];
  sections.forEach((section, sectionIndex) => {
    const around = {
      section,
      sectionIndex,
      leadingSection: sections[sectionIndex - 1],
      trailingSection: sections[sectionIndex + 1],
    };
    headerIndices[sectionIndex] = entries.length;
    entries.push({ kind: SECTION_ENTRY_KIND.header, ...around });
    section.data.forEach((item, itemIndex) => {
      entries.push({
        kind: SECTION_ENTRY_KIND.item,
        item,
        itemIndex,
        leadingItem: section.data[itemIndex - 1],
        trailingItem: section.data[itemIndex + 1],
        ...around,
      });
    });
    entries.push({ kind: SECTION_ENTRY_KIND.footer, ...around });
  });
  return { entries, headerIndices };
}

export type ISeparatorGapProps<ItemT, SectionT = ISection<ItemT>> = {
  leadingItem: ItemT | undefined;
  trailingItem: ItemT | undefined;
  section: SectionT;
  leadingSection: SectionT | undefined;
  trailingSection: SectionT | undefined;
};

export const SEPARATOR_GAP_KIND = {
  none: 'none',
  section: 'section',
  item: 'item',
} as const;

// `none` carries no props. `section` is the section separator, `item` the item one
export type ISeparatorGap<ItemT, SectionT = ISection<ItemT>> =
  | { kind: typeof SEPARATOR_GAP_KIND.none; props?: undefined }
  | {
      kind: typeof SEPARATOR_GAP_KIND.section | typeof SEPARATOR_GAP_KIND.item;
      props: ISeparatorGapProps<ItemT, SectionT>;
    };

const NO_GAP = { kind: SEPARATOR_GAP_KIND.none } as const;

// Which separator RN paints between two neighbouring cells (`_getSeparatorComponent`): the
// section one before a section's first item and after its last, the item one between items
export function sectionGapFor<
  ItemT,
  SectionT extends ISection<ItemT> = ISection<ItemT>,
>(
  previous: ISectionEntry<ItemT, SectionT> | undefined,
  next: ISectionEntry<ItemT, SectionT> | undefined,
): ISeparatorGap<ItemT, SectionT> {
  if (previous === undefined || next === undefined) return NO_GAP;
  const props = {
    leadingItem:
      previous.kind === SECTION_ENTRY_KIND.item ? previous.item : undefined,
    trailingItem: next.kind === SECTION_ENTRY_KIND.item ? next.item : undefined,
    section: previous.section,
    leadingSection: previous.leadingSection,
    trailingSection: previous.trailingSection,
  };
  const { header, item, footer } = SECTION_ENTRY_KIND;
  if (previous.kind === item && next.kind === item)
    return { kind: SEPARATOR_GAP_KIND.item, props };
  const isEdgeOfItems =
    (previous.kind === header && next.kind === item) ||
    (previous.kind === item && next.kind === footer);
  return isEdgeOfItems ? { kind: SEPARATOR_GAP_KIND.section, props } : NO_GAP;
}

// The gaps an item cell paints itself: the leading one only after a header, the trailing one
// always. A gap between two items belongs to the earlier cell
export function cellGapsFor<
  ItemT,
  SectionT extends ISection<ItemT> = ISection<ItemT>,
>(
  entries: ReadonlyArray<ISectionEntry<ItemT, SectionT>>,
  index: number,
): {
  leading: ISeparatorGap<ItemT, SectionT>;
  trailing: ISeparatorGap<ItemT, SectionT>;
} {
  const previous = entries[index - 1];
  const isAfterHeader = previous?.kind === SECTION_ENTRY_KIND.header;
  return {
    leading: isAfterHeader ? sectionGapFor(previous, entries[index]) : NO_GAP,
    trailing: sectionGapFor(entries[index], entries[index + 1]),
  };
}

// RN's own section-relative key (`VirtualizedSectionList.js`'s `_subExtractor`): the section's
// own `key` when given, else its position — never the flat entry index, which is `entry`'s own
// but is not the SECTION's identity.
function sectionKeyPart(
  section: { key?: string },
  sectionIndex: number,
): string {
  return section.key ?? String(sectionIndex);
}

export function sectionEntryKey<ItemT>(
  entry: ISectionEntry<ItemT>,
  keyExtractor?: (item: ItemT, index: number) => string,
): string {
  const sectionKey = sectionKeyPart(entry.section, entry.sectionIndex);
  if (entry.kind === SECTION_ENTRY_KIND.header) return `${sectionKey}:header`;
  if (entry.kind === SECTION_ENTRY_KIND.footer) return `${sectionKey}:footer`;
  const resolve =
    entry.section.keyExtractor ?? keyExtractor ?? defaultKeyExtractor;
  return `${sectionKey}:${resolve(entry.item, entry.itemIndex)}`;
}

// RN's itemIndex is offset by 1 so itemIndex 0 targets the header and itemIndex >= 1
// targets that section's items. Returns undefined when the section is out of range.
export function scrollLocationToFlatIndex(
  headerIndices: number[],
  sectionIndex: number,
  itemIndex: number,
): number | undefined {
  const headerFlatIndex = headerIndices[sectionIndex];
  if (headerFlatIndex === undefined) return undefined;
  return headerFlatIndex + itemIndex;
}

type IFlatItemLayout = { length: number; offset: number; index: number };

// The user's `getItemLayout` gets `sections`, as in RN, while the inner stream is the flat entries
// The flat index matches RN's only without a section separator, it adds a row per boundary
export function layoutOverSections<ItemT>(
  getItemLayout:
    | ((
        data: ReadonlyArray<ISection<ItemT>> | null,
        index: number,
      ) => IFlatItemLayout)
    | undefined,
  sections: ReadonlyArray<ISection<ItemT>>,
): ((entries: unknown, index: number) => IFlatItemLayout) | undefined {
  if (getItemLayout === undefined) return undefined;
  return (_entries, index) => getItemLayout(sections, index);
}

export type IScrollLocation = {
  sectionIndex: number;
  itemIndex: number;
  viewOffset?: number;
  viewPosition?: number;
  animated?: boolean;
};

export type IScrollLocationTarget = {
  index: number;
  viewOffset: number | undefined;
  viewPosition: number | undefined;
  animated: boolean | undefined;
  offsetByCellLength: number | undefined;
};

// What the inner list's `scrollToIndex` takes for a section location, shared by every adapter
// A stuck header covers the target item, so its length joins the offset (RN's `scrollToLocation`)
export function resolveScrollLocation(
  headerIndices: number[],
  stickyHeaderIndices: readonly number[] | undefined,
  location: IScrollLocation,
): IScrollLocationTarget | undefined {
  const { sectionIndex, itemIndex } = location;
  const index = scrollLocationToFlatIndex(
    headerIndices,
    sectionIndex,
    itemIndex,
  );
  if (index === undefined) return undefined;
  const headerIndex = headerIndices[sectionIndex];
  const isCovered =
    itemIndex > 0 && stickyHeaderIndices?.includes(headerIndex) === true;
  return {
    index,
    viewOffset: location.viewOffset,
    viewPosition: location.viewPosition,
    animated: location.animated,
    offsetByCellLength: isCovered ? headerIndex : undefined,
  };
}
