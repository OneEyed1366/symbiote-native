// A whole drawer as elements: the plan, its slots and the root, built with the adapter's factories

import { planDrawer } from './drawer-render-plan';
import type { IDrawerPlanInput } from './drawer-render-plan';
import type { IDrawerNavigatorHandle } from './navigator-handles';
import type { IDrawerSlot } from './render-drawer';

// What the plan reads from the adapter's view input, which carries more fields than these
export type IDrawerViewState = Omit<IDrawerPlanInput, 'closeDrawer'> & {
  handle: IDrawerNavigatorHandle;
  panHandlers: object;
};

type IElementProps = Record<string, unknown>;

// A slot with an animated style must come from the adapter's animated view, not its own type
export type IDrawerElements<TNode, TChildren> = {
  createHost: (
    type: string,
    props: IElementProps,
    children: TChildren,
  ) => TNode;
  createAnimated: (props: IElementProps, children: TChildren) => TNode;
  createRoot: (props: IElementProps, slots: TNode[]) => TNode;
};

export function createDrawerRenderer<
  TView extends IDrawerViewState,
  TNode,
  TChildren,
>(
  elements: IDrawerElements<TNode, TChildren>,
  slotChildren: (view: TView) => Record<IDrawerSlot, TChildren>,
): (view: TView) => TNode {
  return view => {
    const plan = planDrawer({ ...view, closeDrawer: view.handle.closeDrawer });
    const children = slotChildren(view);
    const slots = plan.slots.map(({ slot, descriptor, animatedStyle }) => {
      const props = { key: descriptor.key, ...descriptor.props };
      if (animatedStyle === undefined)
        return elements.createHost(descriptor.type, props, children[slot]);
      const style = [descriptor.props.style, animatedStyle];
      return elements.createAnimated({ ...props, style }, children[slot]);
    });
    return elements.createRoot(
      { style: plan.rootStyle, ...view.panHandlers },
      slots,
    );
  };
}
