// The Vue Drawer's untyped `attrs` and screen markers, narrowed at the one edge they enter

import type { VNode } from '@vue/runtime-core';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import { isRecord } from '../../core';
import type { IDrawerOptions, IDrawerPosition, IDrawerType } from '../../core';
import { collectScreenRegistry } from '../collect-registry';
import { DrawerScreen } from '../drawer-screen';
import type { IDrawerScreenProps } from '../drawer-screen';

export type IDrawerRegistryEntry = {
  component: IDrawerScreenProps['component'];
  options: IDrawerScreenProps['options'];
  initialParams: unknown;
};

// Keyed by `unknown`, so a lookup of an untyped attr comes back typed with no guard or cast
const DRAWER_TYPE_BY_NAME = new Map<unknown, IDrawerType>(
  (['front', 'back', 'slide', 'permanent'] as const).map(type => [type, type]),
);

const DRAWER_POSITION_BY_NAME = new Map<unknown, IDrawerPosition>(
  (['left', 'right'] as const).map(position => [position, position]),
);

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function isStyleProp(value: unknown): value is IStyleProp<IViewStyle> {
  return isRecord(value);
}

export function readDrawerOptions(
  attrs: Record<string, unknown>,
): IDrawerOptions {
  return {
    drawerType: DRAWER_TYPE_BY_NAME.get(attrs.drawerType),
    drawerPosition: DRAWER_POSITION_BY_NAME.get(attrs.drawerPosition),
    drawerWidth: asNumber(attrs.drawerWidth),
    overlayColor: asString(attrs.overlayColor),
    swipeEnabled: asBoolean(attrs.swipeEnabled),
    swipeEdgeWidth: asNumber(attrs.swipeEdgeWidth),
    swipeMinDistance: asNumber(attrs.swipeMinDistance),
    swipeMinVelocity: asNumber(attrs.swipeMinVelocity),
  };
}

export function collectDrawerRegistry(
  vnodes: readonly VNode[],
): Map<string, IDrawerRegistryEntry> {
  return collectScreenRegistry<
    IDrawerScreenProps['component'],
    NonNullable<IDrawerScreenProps['options']>
  >(vnodes, DrawerScreen);
}
