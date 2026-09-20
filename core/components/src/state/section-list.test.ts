import { describe, it, expect } from 'vitest';
import {
  flattenSections,
  sectionEntryKey,
  type ISection,
} from './section-list';

const sectionA: ISection<{ id: string }> = { title: 'A', data: [{ id: 'a0' }] };
const sectionB: ISection<{ id: string }> = { title: 'B', data: [{ id: 'b0' }] };

describe('sectionEntryKey', () => {
  // why: VirtualizedSectionList.js's `_subExtractor` keys a header/footer off
  // `section.key || String(sectionIndex)` — an app-supplied `section.key` (the common RN
  // convention for stable section identity across reorders) must not be ignored in favor of the
  // section's raw position.
  it("keys a header off the section's own key when given, not its position", () => {
    const keyed: ISection<{ id: string }> = { ...sectionA, key: 'alpha' };
    const [header] = flattenSections([keyed], false).entries;
    expect(sectionEntryKey(header, 0)).toBe('alpha:header');
  });

  it('falls back to the section position when it has no key', () => {
    const [header] = flattenSections([sectionA], false).entries;
    expect(sectionEntryKey(header, 0)).toBe('0:header');
  });

  it('keys a footer the same way, suffixed :footer', () => {
    const { entries } = flattenSections([sectionA], false);
    const footer = entries[entries.length - 1];
    expect(sectionEntryKey(footer, entries.length - 1)).toBe('0:footer');
  });

  // why: `_subExtractor` prefixes an item's own key with the section's, `sectionKey:itemKey` —
  // two sections whose items share an id (e.g. both start a fresh 0) must not collide.
  it('prefixes an item key with its section key', () => {
    const { entries } = flattenSections([sectionA, sectionB], false);
    const itemInA = entries.find(
      entry => entry.kind === 'item' && entry.section === sectionA,
    )!;
    const itemInB = entries.find(
      entry => entry.kind === 'item' && entry.section === sectionB,
    )!;
    expect(sectionEntryKey(itemInA, 0, item => item.id)).toBe('0:a0');
    expect(sectionEntryKey(itemInB, 0, item => item.id)).toBe('1:b0');
  });

  // why: `section.keyExtractor || keyExtractor || defaultKeyExtractor` — a per-section
  // keyExtractor overrides the list-wide one, matching VirtualizedSectionList.js:305.
  it('lets a per-section keyExtractor override the list-wide one', () => {
    const overridden: ISection<{ id: string }> = {
      ...sectionA,
      keyExtractor: item => `custom-${item.id}`,
    };
    const { entries } = flattenSections([overridden], false);
    const item = entries.find(entry => entry.kind === 'item')!;
    expect(sectionEntryKey(item, 0, i => i.id)).toBe('0:custom-a0');
  });

  it('falls back to item.key/id when no keyExtractor is given anywhere', () => {
    const withIds: ISection<{ id: string }> = {
      title: 'A',
      data: [{ id: 'a0' }],
    };
    const { entries } = flattenSections([withIds], false);
    const item = entries.find(entry => entry.kind === 'item')!;
    expect(sectionEntryKey(item, 0)).toBe('0:a0');
  });
});
