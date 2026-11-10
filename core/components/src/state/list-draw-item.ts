// The part of drawing one cell every adapter shares: pick the drawer, call it
// An adapter hands over how a component is drawn, `createElement`, `h`, a JSX component call

import { ITEM_RENDERER, pickItemRenderer } from './list-item-renderer';

export type IItemDrawers<TInfo, TOut, TComponent> = {
  renderItem: ((info: TInfo) => TOut) | undefined;
  component: TComponent | undefined;
};

export function drawItem<TInfo, TOut, TComponent>(
  drawers: IItemDrawers<TInfo, TOut, TComponent>,
  info: TInfo,
  drawComponent: (component: TComponent, info: TInfo) => TOut,
): TOut | undefined {
  const { renderItem, component } = drawers;
  const kind = pickItemRenderer({
    hasRenderItem: renderItem !== undefined,
    hasComponent: component !== undefined,
  });
  if (kind === ITEM_RENDERER.component && component !== undefined) {
    return drawComponent(component, info);
  }
  return renderItem?.(info);
}
