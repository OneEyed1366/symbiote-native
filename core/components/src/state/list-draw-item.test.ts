// Один путь отрисовки ячейки для адаптеров: компонент против `renderItem`
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawItem } from './list-draw-item';

const BOTH_PRESENT =
  'VirtualizedList: Both ListItemComponent and renderItem props are present. ListItemComponent will take precedence over renderItem.';
const NONE_FOUND =
  'VirtualizedList: Either ListItemComponent or renderItem props are required but none were found.';

const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

afterEach(() => warn.mockClear());

const info = { index: 4 };
const asComponent = (component: string, given: { index: number }) =>
  `${component}#${given.index}`;

describe('drawItem', () => {
  it('draws with renderItem', () => {
    expect(
      drawItem(
        { renderItem: given => `fn#${given.index}`, component: undefined },
        info,
        asComponent,
      ),
    ).toBe('fn#4');
  });

  it('draws with the component through the adapter hook', () => {
    expect(
      drawItem({ renderItem: undefined, component: 'Item' }, info, asComponent),
    ).toBe('Item#4');
  });

  it('prefers the component and warns when both are given', () => {
    expect(
      drawItem(
        { renderItem: () => 'fn', component: 'Item' },
        info,
        asComponent,
      ),
    ).toBe('Item#4');
    expect(warn).toHaveBeenCalledWith(BOTH_PRESENT);
  });

  it('throws when neither is given', () => {
    expect(() =>
      drawItem(
        { renderItem: undefined, component: undefined },
        info,
        asComponent,
      ),
    ).toThrow(NONE_FOUND);
  });
});
