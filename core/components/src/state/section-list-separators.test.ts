// Which separator sits in the gap between two flat cells, and what it is told, after
// `VirtualizedSectionList.js` `_getSeparatorComponent` (:497) and `ItemWithSeparator` (:560)
import { describe, expect, it } from 'vitest';

import {
  flattenSections,
  sectionGapFor,
  type ISection,
  type ISectionEntry,
} from './section-list';

type IRow = { id: string };

const row = (id: string): IRow => ({ id });
const section = (title: string, ids: string[]): ISection<IRow> => ({
  title,
  key: title,
  data: ids.map(row),
});

function entriesOf(sections: ISection<IRow>[]): ISectionEntry<IRow>[] {
  return flattenSections(sections).entries;
}

describe('flattenSections', () => {
  it('never emits a section-separator cell', () => {
    const entries = entriesOf([section('a', ['1']), section('b', ['2'])]);

    expect(entries.map(entry => entry.kind)).toEqual([
      'header',
      'item',
      'footer',
      'header',
      'item',
      'footer',
    ]);
  });
});

describe('sectionGapFor', () => {
  const a = section('a', ['1', '2']);
  const b = section('b', ['3']);
  const [header, first, second, footer, , third] = entriesOf([a, b]);

  it('puts a section separator between a header and its first item', () => {
    const gap = sectionGapFor(header, first);

    expect(gap.kind).toBe('section');
    expect(gap.props).toEqual({
      leadingItem: undefined,
      trailingItem: row('1'),
      section: a,
      leadingSection: undefined,
      trailingSection: b,
    });
  });

  it('puts an item separator between two items of one section', () => {
    const gap = sectionGapFor(first, second);

    expect(gap.kind).toBe('item');
    expect(gap.props).toEqual({
      leadingItem: row('1'),
      trailingItem: row('2'),
      section: a,
      leadingSection: undefined,
      trailingSection: b,
    });
  });

  it('puts a section separator between the last item and the footer', () => {
    const gap = sectionGapFor(second, footer);

    expect(gap.kind).toBe('section');
    expect(gap.props).toEqual({
      leadingItem: row('2'),
      trailingItem: undefined,
      section: a,
      leadingSection: undefined,
      trailingSection: b,
    });
  });

  it('tells the neighbouring sections to a middle section', () => {
    const c = section('c', ['4']);
    const entries = entriesOf([a, b, c]);
    const middleHeader = entries.find(
      entry => entry.kind === 'header' && entry.section === b,
    );
    const middleItem = entries.find(
      entry => entry.kind === 'item' && entry.section === b,
    );

    expect(sectionGapFor(middleHeader, middleItem).props).toMatchObject({
      leadingSection: a,
      trailingSection: c,
    });
  });

  it('leaves every other gap bare', () => {
    expect(sectionGapFor(footer, third).kind).toBe('none');
    expect(sectionGapFor(undefined, header).kind).toBe('none');
    expect(sectionGapFor(header, footer).kind).toBe('none');
  });
});
