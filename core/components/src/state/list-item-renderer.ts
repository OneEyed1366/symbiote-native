// Which of `ListItemComponent` / `renderItem` draws a cell, RN's `VirtualizedListCellRenderer`

export const ITEM_RENDERER = {
  component: 'component',
  renderItem: 'renderItem',
} as const;

export type IItemRenderer = (typeof ITEM_RENDERER)[keyof typeof ITEM_RENDERER];

const BOTH_PRESENT =
  'VirtualizedList: Both ListItemComponent and renderItem props are present. ListItemComponent will take precedence over renderItem.';
const NONE_FOUND =
  'VirtualizedList: Either ListItemComponent or renderItem props are required but none were found.';

export function pickItemRenderer(given: {
  hasRenderItem: boolean;
  hasComponent: boolean;
}): IItemRenderer {
  if (given.hasComponent) {
    if (given.hasRenderItem) console.warn(BOTH_PRESENT);
    return ITEM_RENDERER.component;
  }
  if (given.hasRenderItem) return ITEM_RENDERER.renderItem;
  throw new Error(NONE_FOUND);
}
