import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_SECTIONS,
  SECTION_LIST_HEADER_HEIGHT,
  SECTION_LIST_ROW_HEIGHT,
  SECTION_LIST_ROWS_PER_SECTION,
  SECTION_LIST_SECTION_COUNT,
  sectionListItemLayout,
  STICKY_ENTRIES,
  STICKY_KIND,
  STICKY_ROWS_PER_SECTION,
  STICKY_SECTION_COUNT,
} from './bench-sticky';

const ENTRIES_PER_SECTION = SECTION_LIST_ROWS_PER_SECTION + 2;

describe('SectionList fixed layout', () => {
  it('lays every cell right after the previous one, so a fast drag never meets a gap', () => {
    const cells = Array.from(
      { length: SECTION_LIST_SECTION_COUNT * ENTRIES_PER_SECTION },
      (_value, index) => sectionListItemLayout(undefined, index),
    );
    const expectedOffsets = cells.reduce<number[]>(
      (offsets, cell, index) => [
        ...offsets,
        index === 0
          ? 0
          : (offsets[index - 1] ?? 0) + (cells[index - 1]?.length ?? 0),
      ],
      [],
    );

    expect(cells.map(cell => cell.offset)).toEqual(expectedOffsets);
    expect(cells.map(cell => cell.index)).toEqual(
      cells.map((_cell, index) => index),
    );
  });

  it('gives a section header, rows and a zero-height footer, in that order', () => {
    const header = sectionListItemLayout(undefined, 0);
    const row = sectionListItemLayout(undefined, 1);
    const footer = sectionListItemLayout(undefined, ENTRIES_PER_SECTION - 1);

    expect(header.length).toBe(SECTION_LIST_HEADER_HEIGHT);
    expect(row.length).toBe(SECTION_LIST_ROW_HEIGHT);
    expect(footer.length).toBe(0);
  });
});

describe('sticky benchmark data', () => {
  it('follows each of the sticky headers with its own rows', () => {
    const perSection = STICKY_ROWS_PER_SECTION + 1;
    const headerPositions = STICKY_ENTRIES.flatMap((entry, index) =>
      entry.kind === STICKY_KIND.Header ? [index] : [],
    );

    expect(headerPositions).toHaveLength(STICKY_SECTION_COUNT);
    expect(
      headerPositions.every(
        (position, index) => position === index * perSection,
      ),
    ).toBe(true);
  });

  it('keys every entry and every section row uniquely', () => {
    const stickyKeys = STICKY_ENTRIES.map(entry => entry.key);
    const sectionKeys = BENCHMARK_SECTIONS.flatMap(section =>
      section.data.map(item => item.id),
    );

    expect(new Set(stickyKeys).size).toBe(stickyKeys.length);
    expect(new Set(sectionKeys).size).toBe(sectionKeys.length);
  });
});
