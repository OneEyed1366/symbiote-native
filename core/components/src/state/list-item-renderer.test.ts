// Кто рисует ячейку в RN: `ListItemComponent` или `renderItem`
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ITEM_RENDERER, pickItemRenderer } from './list-item-renderer';

const BOTH_PRESENT =
  'VirtualizedList: Both ListItemComponent and renderItem props are present. ListItemComponent will take precedence over renderItem.';
const NONE_FOUND =
  'VirtualizedList: Either ListItemComponent or renderItem props are required but none were found.';

const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

afterEach(() => warn.mockClear());

describe('pickItemRenderer', () => {
  it('draws with renderItem when only it is given', () => {
    expect(pickItemRenderer({ hasRenderItem: true, hasComponent: false })).toBe(
      ITEM_RENDERER.renderItem,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('draws with the component when only it is given', () => {
    expect(pickItemRenderer({ hasRenderItem: false, hasComponent: true })).toBe(
      ITEM_RENDERER.component,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('lets the component win and warns when both are given', () => {
    expect(pickItemRenderer({ hasRenderItem: true, hasComponent: true })).toBe(
      ITEM_RENDERER.component,
    );
    expect(warn).toHaveBeenCalledWith(BOTH_PRESENT);
  });

  it('throws RN invariant text when neither is given', () => {
    expect(() =>
      pickItemRenderer({ hasRenderItem: false, hasComponent: false }),
    ).toThrow(NONE_FOUND);
  });
});
