// The screens a Vue navigator's slot registers, read off its marker vnodes by name

import type { VNode } from '@vue/runtime-core';
import { isRecord } from '../core';
import { collectScreenVnodes } from './collect-screen-vnodes';

export type IRegistryEntry<TComponent, TOptions> = {
  component: TComponent;
  options: TOptions | undefined;
  initialParams: unknown;
};

// Vnode props are untyped, and a component or an options resolver is a function while options
// are a record, so one runtime check serves both. It is the one place the types are taken on trust
function isFunctionOrRecord<T extends object>(value: unknown): value is T {
  return typeof value === 'function' || isRecord(value);
}

export function collectScreenRegistry<
  TComponent extends object,
  TOptions extends object,
>(
  vnodes: readonly VNode[],
  marker: VNode['type'],
): Map<string, IRegistryEntry<TComponent, TOptions>> {
  const registry = new Map<string, IRegistryEntry<TComponent, TOptions>>();
  for (const vnode of collectScreenVnodes(vnodes, marker)) {
    if (!isRecord(vnode.props)) continue;
    const { name, component, options, initialParams } = vnode.props;
    if (typeof name !== 'string') continue;
    if (!isFunctionOrRecord<TComponent>(component)) continue;
    registry.set(name, {
      component,
      options: isFunctionOrRecord<TOptions>(options) ? options : undefined,
      initialParams,
    });
  }
  return registry;
}
