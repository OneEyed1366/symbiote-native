// The Vue Tab's untyped `attrs` and screen markers, narrowed at the one edge they enter

import type { VNode } from '@vue/runtime-core';
import { isRecord } from '../../core';
import type { ITabOptions } from '../../core';
import { collectScreenRegistry } from '../collect-registry';
import { TabScreen } from '../tab-screen';
import type { ITabScreenProps } from '../tab-screen';

export type ITabRegistryEntry = {
  component: ITabScreenProps['component'];
  options: ITabScreenProps['options'];
  initialParams: unknown;
};

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function isTabOptions(value: unknown): value is ITabOptions {
  return isRecord(value);
}

export function collectTabRegistry(
  vnodes: readonly VNode[],
): Map<string, ITabRegistryEntry> {
  return collectScreenRegistry<
    ITabScreenProps['component'],
    NonNullable<ITabScreenProps['options']>
  >(vnodes, TabScreen);
}
