import { describe, it, expect } from 'vitest';
import {
  flattenSections,
  resolveScrollLocation,
  sectionEntryKey,
  type ISection,
} from './section-list';

const sectionA: ISection<{ id: string }> = { title: 'A', data: [{ id: 'a0' }] };
const sectionB: ISection<{ id: string }> = { title: 'B', data: [{ id: 'b0' }] };

describe('resolveScrollLocation', () => {
  const sections: ISection<{ id: string }>[] = [sectionA, sectionB];
  const { headerIndices } = flattenSections(sections);

  it('maps itemIndex 0 to the header and the rest to that section items', () => {
    expect(
      resolveScrollLocation(headerIndices, [], {
        sectionIndex: 1,
        itemIndex: 1,
      })?.index,
    ).toBe(headerIndices[1] + 1);
    expect(
      resolveScrollLocation(headerIndices, [], {
        sectionIndex: 0,
        itemIndex: 0,
      })?.index,
    ).toBe(0);
  });

  it('reports nothing for a section out of range', () => {
    expect(
      resolveScrollLocation(headerIndices, [], {
        sectionIndex: 5,
        itemIndex: 0,
      }),
    ).toBeUndefined();
  });

  it('asks to add the sticky header length when targeting an item under it', () => {
    const sticky = resolveScrollLocation(headerIndices, headerIndices, {
      sectionIndex: 1,
      itemIndex: 1,
      viewOffset: 25,
    });

    expect(sticky).toMatchObject({
      viewOffset: 25,
      offsetByCellLength: headerIndices[1],
    });
  });

  it('leaves the offset alone for the header itself or without sticky headers', () => {
    const onHeader = resolveScrollLocation(headerIndices, headerIndices, {
      sectionIndex: 1,
      itemIndex: 0,
    });
    const unstuck = resolveScrollLocation(headerIndices, [], {
      sectionIndex: 1,
      itemIndex: 1,
    });

    expect(onHeader?.offsetByCellLength).toBeUndefined();
    expect(unstuck?.offsetByCellLength).toBeUndefined();
  });
});

describe('sectionEntryKey', () => {
  // `_subExtractor` keys a header off `section.key || String(sectionIndex)`
  it("keys a header off the section's own key when given, not its position", () => {
    const keyed: ISection<{ id: string }> = { ...sectionA, key: 'alpha' };
    const [header] = flattenSections([keyed]).entries;
    expect(sectionEntryKey(header)).toBe('alpha:header');
  });

  it('falls back to the section position when it has no key', () => {
    const [header] = flattenSections([sectionA]).entries;
    expect(sectionEntryKey(header)).toBe('0:header');
  });

  it('keys a footer the same way, suffixed :footer', () => {
    const { entries } = flattenSections([sectionA]);
    const footer = entries[entries.length - 1];
    expect(sectionEntryKey(footer)).toBe('0:footer');
  });

  // `_subExtractor` prefixes an item key with the section's, so shared ids do not collide
  it('prefixes an item key with its section key', () => {
    const { entries } = flattenSections([sectionA, sectionB]);
    const itemInA = entries.find(
      entry => entry.kind === 'item' && entry.section === sectionA,
    )!;
    const itemInB = entries.find(
      entry => entry.kind === 'item' && entry.section === sectionB,
    )!;
    expect(sectionEntryKey(itemInA, item => item.id)).toBe('0:a0');
    expect(sectionEntryKey(itemInB, item => item.id)).toBe('1:b0');
  });

  // `section.keyExtractor || keyExtractor || defaultKeyExtractor`, as in RN
  it('lets a per-section keyExtractor override the list-wide one', () => {
    const overridden: ISection<{ id: string }> = {
      ...sectionA,
      keyExtractor: item => `custom-${item.id}`,
    };
    const { entries } = flattenSections([overridden]);
    const item = entries.find(entry => entry.kind === 'item')!;
    expect(sectionEntryKey(item, i => i.id)).toBe('0:custom-a0');
  });

  it('falls back to item.key/id when no keyExtractor is given anywhere', () => {
    const withIds: ISection<{ id: string }> = {
      title: 'A',
      data: [{ id: 'a0' }],
    };
    const { entries } = flattenSections([withIds]);
    const item = entries.find(entry => entry.kind === 'item')!;
    expect(sectionEntryKey(item)).toBe('0:a0');
  });
});
