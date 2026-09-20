// SectionList logic: the framework-agnostic section flattening over VirtualizedList. Each
// section contributes a header row, its item rows, then a footer row (RN counts 2 per
// section around the items); the flattened sequence feeds VirtualizedList as one tagged
// stream, so headers, items, and footers are windowed by the same machinery. All of this
// is pure transform - every adapter reuses it; the adapter supplies only the per-entry
// element creation (renderSectionHeader / renderItem / etc.) and the ref wiring.

import { defaultKeyExtractor } from './virtualized-list';
import type { IScrollRoutingHandle } from './scroll-routing-handle';

export interface ISection<ItemT> {
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
}

// A flattened entry is a section header, an item, a section footer, or a between-sections
// separator, tagged so the single renderItem can dispatch to the right renderer. The
// separator carries no data - it just paints the gap.
export type ISectionEntry<ItemT> =
  | { kind: 'header'; section: ISection<ItemT>; sectionIndex: number }
  | {
      kind: 'item';
      item: ItemT;
      section: ISection<ItemT>;
      sectionIndex: number;
      itemIndex: number;
    }
  | { kind: 'footer'; section: ISection<ItemT>; sectionIndex: number }
  | { kind: 'section-separator'; sectionIndex: number };

// The imperative API RN exposes on a SectionList ref. scrollToLocation is this handle's
// own primary member: it resolves a (sectionIndex, itemIndex) coordinate to the flattened
// entry index and forwards to the inner VirtualizedList's scrollToIndex. The
// flash/scroll-ref/interaction tail is the inner-scroll routing shared with
// VirtualizedList (see IScrollRoutingHandle) - extending it, rather than re-declaring it,
// is what keeps the two handle types from drifting from each other.
export interface IVirtualizedSectionListHandle extends IScrollRoutingHandle {
  scrollToLocation(params: {
    sectionIndex: number;
    itemIndex: number;
    viewOffset?: number;
    viewPosition?: number;
    animated?: boolean;
  }): void;
}

// Flatten sections into entries AND record where each section header lands in the flat
// stream, so scrollToLocation can map (sectionIndex, itemIndex) -> flat index without
// re-deriving the layout. withSeparators inserts a section separator between adjacent
// sections (never before the first / after the last).
export function flattenSections<ItemT>(
  sections: ReadonlyArray<ISection<ItemT>>,
  withSeparators: boolean,
): { entries: ISectionEntry<ItemT>[]; headerIndices: number[] } {
  const entries: ISectionEntry<ItemT>[] = [];
  const headerIndices: number[] = [];
  sections.forEach((section, sectionIndex) => {
    if (withSeparators && sectionIndex > 0) {
      entries.push({ kind: 'section-separator', sectionIndex });
    }
    headerIndices[sectionIndex] = entries.length;
    entries.push({ kind: 'header', section, sectionIndex });
    section.data.forEach((item, itemIndex) => {
      entries.push({ kind: 'item', item, section, sectionIndex, itemIndex });
    });
    entries.push({ kind: 'footer', section, sectionIndex });
  });
  return { entries, headerIndices };
}

// Unwrap an entry separator-prop into its underlying ItemT (or undefined for a non-item
// entry: header/footer/section-separator gaps have no item), so the user's
// ItemSeparatorComponent, typed on ItemT, sees real items.
export function unwrapEntryItem<ItemT>(
  entry: ISectionEntry<ItemT> | undefined,
): ItemT | undefined {
  return entry !== undefined && entry.kind === 'item' ? entry.item : undefined;
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
  index: number,
  keyExtractor?: (item: ItemT, index: number) => string,
): string {
  if (entry.kind === 'section-separator')
    return `section-${entry.sectionIndex}:separator`;
  const sectionKey = sectionKeyPart(entry.section, entry.sectionIndex);
  if (entry.kind === 'header') return `${sectionKey}:header`;
  if (entry.kind === 'footer') return `${sectionKey}:footer`;
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
