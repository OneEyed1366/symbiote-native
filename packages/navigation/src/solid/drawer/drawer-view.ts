// The Solid Drawer's view: `renderDrawer`'s descriptor built into host nodes once per drawer shape,
// with each slot's animated style and children flowing through live props
// A type, position or animation change is the rebuild boundary: solid-descriptor-bridge rules §5

import { createMemo, untrack } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import { insert } from '@symbiote-native/solid/renderer';
import type {
  AnimatedValue,
  IStyleProp,
  ISymbioteNode,
  IViewStyle,
} from '@symbiote-native/engine';
import type { IDescriptor } from '@symbiote-native/components';
import {
  DRAWER_DEFAULT_OVERLAY_COLOR,
  buildAnimatedSlotStyle,
  drawerChildOrder,
  isDrawerAnimated,
  renderDrawer,
  resolveDrawerGeometry,
  resolveDrawerPosition,
  resolveDrawerType,
} from '../../core';
import type { IDrawerOptions, IDrawerSlot } from '../../core';
import { hostElement } from '../host';

export type IDrawerViewInput = {
  options: () => IDrawerOptions;
  overlayColor: () => string | undefined;
  drawerStyle: () => IStyleProp<IViewStyle> | undefined;
  isOpen: () => boolean;
  closeDrawer: () => void;
  progress: AnimatedValue;
  panHandlers: object;
  content: Accessor<JSX.Element>;
  panel: Accessor<JSX.Element>;
};

type IDrawerShape = { type: string; position: string; animated: boolean };

type ISlotEnv = {
  input: IDrawerViewInput;
  shape: IDrawerShape;
  rootDescriptor: Accessor<IDescriptor>;
  order: readonly IDrawerSlot[];
};

function sameDrawerShape(a: IDrawerShape, b: IDrawerShape): boolean {
  return (
    a.type === b.type && a.position === b.position && a.animated === b.animated
  );
}

function createRootDescriptor(
  input: IDrawerViewInput,
  shape: IDrawerShape,
): Accessor<IDescriptor> {
  return createMemo(() =>
    renderDrawer(
      {
        overlayColor: input.overlayColor() ?? DRAWER_DEFAULT_OVERLAY_COLOR,
        drawerStyle: input.drawerStyle(),
        contentPassthrough: {},
        overlayPassthrough: shape.animated
          ? {
              pointerEvents: input.isOpen() ? 'auto' : 'none',
              onStartShouldSetResponder: () => true,
              onResponderRelease: () => input.closeDrawer(),
            }
          : {},
        panelPassthrough: {},
      },
      input.options(),
    ),
  );
}

// Holds `AnimatedInterpolation` nodes, so it only feeds a view's permissive `style`
// Recomputed with the geometry, which reaches the live node as a prop update and not a rebuild
function animatedStyle(env: ISlotEnv, slot: IDrawerSlot): unknown {
  const { input, shape } = env;
  if (!shape.animated) return undefined;
  const geometry = resolveDrawerGeometry(input.options());
  return buildAnimatedSlotStyle(input.progress, geometry, slot);
}

function slotDescriptor(env: ISlotEnv, slot: IDrawerSlot): IDescriptor {
  const child = env.rootDescriptor().children[env.order.indexOf(slot)];
  if (child === undefined || typeof child === 'string') {
    throw new Error(`Drawer: renderDrawer produced no "${slot}" slot`);
  }
  return child;
}

// The overlay has no children, so a missing entry is not a gap
function slotChildren(input: IDrawerViewInput, slot: IDrawerSlot): JSX.Element {
  const children: Partial<Record<IDrawerSlot, Accessor<JSX.Element>>> = {
    content: input.content,
    panel: input.panel,
  };
  return children[slot]?.();
}

function buildSlot(env: ISlotEnv, slot: IDrawerSlot): JSX.Element {
  if (animatedStyle(env, slot) === undefined) {
    const node = hostElement(
      slotDescriptor(env, slot).type,
      () => slotDescriptor(env, slot).props,
    );
    const children = slotChildren(env.input, slot);
    if (children !== undefined) insert(node, children);
    return node;
  }
  // One source bag, never a spread followed by an explicit prop: a later `undefined` would lose to
  // an earlier value. A plain `view` binds the interpolation, as the engine resolves animated nodes
  const animated = hostElement('view', () => ({
    ...slotDescriptor(env, slot).props,
    style: [slotDescriptor(env, slot).props.style, animatedStyle(env, slot)],
  }));
  // An accessor, since the slot's children mount after this node is built
  insert(animated, () => slotChildren(env.input, slot));
  return animated;
}

function buildDrawer(
  input: IDrawerViewInput,
  shape: IDrawerShape,
): ISymbioteNode {
  const order = drawerChildOrder(input.options());
  const rootDescriptor = createRootDescriptor(input, shape);
  const env: ISlotEnv = { input, shape, rootDescriptor, order };
  const root = hostElement('view', () => ({
    ...rootDescriptor().props,
    ...input.panHandlers,
  }));
  insert(
    root,
    order.map(slot => buildSlot(env, slot)),
  );
  return root;
}

export function createDrawerHost(input: IDrawerViewInput): ISymbioteNode {
  const shape = createMemo<IDrawerShape>(
    () => {
      const options = input.options();
      return {
        type: resolveDrawerType(options),
        position: resolveDrawerPosition(options),
        animated: isDrawerAnimated(options),
      };
    },
    { type: '', position: '', animated: false },
    { equals: sameDrawerShape },
  );
  const drawer = createMemo(() => {
    const current = shape();
    return untrack(() => buildDrawer(input, current));
  });
  const host = hostElement('view', () => ({ style: { flex: 1 } }));
  insert(host, drawer);
  return host;
}
