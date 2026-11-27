// Data and fixed layout of the two sticky-header boxes on the benchmark screen
// Both boxes share a viewport height and a header look, so a difference between them
// isolates virtualization from stickiness itself
import type { ISection } from '@symbiote-native/svelte';

export const STICKY_SECTION_COUNT = 200;
export const STICKY_ROWS_PER_SECTION = 3;
export const SECTION_LIST_SECTION_COUNT = 16;
export const SECTION_LIST_ROWS_PER_SECTION = 32;
export const SECTION_LIST_ROW_HEIGHT = 30;
export const SECTION_LIST_HEADER_HEIGHT = 28;

// RN raises the scroll event rate for sticky headers
// Both boxes ask for the same 16ms, so the two paths are compared under one scroll cadence
export const SCROLL_EVENT_THROTTLE_MS = 16;

// Every section flattens to a header row, its item rows, then a footer row
// The footer is emitted even with no `sectionFooter` snippet, and then it has no height
const SECTION_LIST_FOOTER_HEIGHT = 0;
const SECTION_LIST_ENTRIES_PER_SECTION = 1 + SECTION_LIST_ROWS_PER_SECTION + 1;
const SECTION_LIST_SECTION_EXTENT =
  SECTION_LIST_HEADER_HEIGHT +
  SECTION_LIST_ROWS_PER_SECTION * SECTION_LIST_ROW_HEIGHT;

type ICellLayout = { length: number; offset: number; index: number };

// The fixed-layout fast path for sticky path B: without it a cell's extent is known only after
// measuring, so a fast drag outruns measurement and leaves the window blank for seconds
// The index is flat over the whole stream, so it is decoded here into a section and a position
export function sectionListItemLayout(
  _sections: unknown,
  index: number,
): ICellLayout {
  const sectionIndex = Math.floor(index / SECTION_LIST_ENTRIES_PER_SECTION);
  const withinSection = index - sectionIndex * SECTION_LIST_ENTRIES_PER_SECTION;
  const sectionOffset = sectionIndex * SECTION_LIST_SECTION_EXTENT;
  if (withinSection === 0) {
    return { length: SECTION_LIST_HEADER_HEIGHT, offset: sectionOffset, index };
  }
  if (withinSection === SECTION_LIST_ENTRIES_PER_SECTION - 1) {
    // The zero-height footer sits exactly where the next section begins
    return {
      length: SECTION_LIST_FOOTER_HEIGHT,
      offset: sectionOffset + SECTION_LIST_SECTION_EXTENT,
      index,
    };
  }
  return {
    length: SECTION_LIST_ROW_HEIGHT,
    offset:
      sectionOffset +
      SECTION_LIST_HEADER_HEIGHT +
      (withinSection - 1) * SECTION_LIST_ROW_HEIGHT,
    index,
  };
}

type IStickyListItem = {
  id: string;
  label: string;
};

// Every section is far taller than the 320px viewport, so headers cross-talk while scrolling
export const BENCHMARK_SECTIONS: ISection<IStickyListItem>[] = Array.from(
  { length: SECTION_LIST_SECTION_COUNT },
  (_value, section) => ({
    title: `SECTION ${section + 1}`,
    data: Array.from(
      { length: SECTION_LIST_ROWS_PER_SECTION },
      (_rowValue, row) => ({
        id: `s${section}-r${row}`,
        label: `row ${section + 1}.${row + 1}`,
      }),
    ),
  }),
);

// `kind` is what the markup switches on to wrap only the headers
export const STICKY_KIND = { Header: 'header', Row: 'row' } as const;

type IStickyKind = (typeof STICKY_KIND)[keyof typeof STICKY_KIND];

type IStickyEntry = {
  key: string;
  kind: IStickyKind;
  text: string;
};

// Sticky path A children, flattened once at module scope: a header followed by its rows
// Rebuilding 800 entries on a re-render would add its own cost to what the meter reports
export const STICKY_ENTRIES: readonly IStickyEntry[] = Array.from(
  { length: STICKY_SECTION_COUNT },
  (_value, section): IStickyEntry[] => [
    {
      key: `sticky-header-${section}`,
      kind: STICKY_KIND.Header,
      text: `SECTION ${section + 1}`,
    },
    ...Array.from(
      { length: STICKY_ROWS_PER_SECTION },
      (_rowValue, row): IStickyEntry => ({
        key: `sticky-row-${section}-${row}`,
        kind: STICKY_KIND.Row,
        text: `row ${section + 1}.${row + 1}`,
      }),
    ),
  ],
).flat();
