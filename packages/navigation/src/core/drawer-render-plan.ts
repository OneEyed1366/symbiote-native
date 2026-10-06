// What a drawer renders, as data: the root style and each slot's descriptor and animated style
// An adapter only creates its own elements from it, and fills the slots with its own children

import { dlog } from '@symbiote-native/engine';
import type {
  AnimatedValue,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';
import type { IDescriptor } from '@symbiote-native/components';
import {
  DRAWER_DEFAULT_OVERLAY_COLOR,
  isDrawerAnimated,
  resolveDrawerGeometry,
} from './drawer-options';
import type { IDrawerOptions } from './drawer-options';
import { buildAnimatedSlotStyle } from './drawer-slot-style';
import type { IDrawerRouterState } from './drawer-router-state';
import { drawerChildOrder, renderDrawer } from './render-drawer';
import type { IDrawerSlot } from './render-drawer';

export type IDrawerPlanInput = {
  state: IDrawerRouterState;
  options: IDrawerOptions;
  drawerStyle: IStyleProp<IViewStyle> | undefined;
  progress: Pick<AnimatedValue, 'interpolate'>;
  closeDrawer: () => void;
};

export type IDrawerSlotPlan = {
  slot: IDrawerSlot;
  descriptor: IDescriptor;
  // Holds `AnimatedInterpolation` nodes, so it only feeds a view's permissive `style`
  animatedStyle: unknown;
};

export type IDrawerPlan = {
  rootStyle: unknown;
  slots: IDrawerSlotPlan[];
};

export function planDrawer(input: IDrawerPlanInput): IDrawerPlan {
  const { state, options, drawerStyle, progress, closeDrawer } = input;
  const isAnimated = isDrawerAnimated(options);
  const root = renderDrawer(
    {
      overlayColor: options.overlayColor ?? DRAWER_DEFAULT_OVERLAY_COLOR,
      drawerStyle,
      contentPassthrough: {},
      overlayPassthrough: isAnimated
        ? {
            pointerEvents: state.isOpen ? 'auto' : 'none',
            onStartShouldSetResponder: () => true,
            onResponderRelease: () => closeDrawer(),
          }
        : {},
      panelPassthrough: {},
    },
    options,
  );
  const geometry = resolveDrawerGeometry(options);
  const slots: IDrawerSlotPlan[] = [];
  drawerChildOrder(options).forEach((slot, index) => {
    const descriptor = root.children[index];
    if (typeof descriptor === 'string') return;
    slots.push({
      slot,
      descriptor,
      animatedStyle: isAnimated
        ? buildAnimatedSlotStyle(progress, geometry, slot)
        : undefined,
    });
  });
  return { rootStyle: root.props.style, slots };
}

// Only the focused route's screen is mounted, like Tab and unlike Stack
export function findFocusedEntry<TEntry>(
  state: IDrawerRouterState,
  entryFor: (routeName: string) => TEntry | undefined,
) {
  const route = state.routes[state.index];
  if (route === undefined) return undefined;
  const entry = entryFor(route.name);
  if (entry === undefined) {
    dlog(`Drawer: no screen registered for route name "${route.name}"`);
    return undefined;
  }
  return { route, entry };
}
