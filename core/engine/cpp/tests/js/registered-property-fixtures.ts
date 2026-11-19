// Shared set-up of the ported wpt `css-properties-values-api` files: a registry to start clean from
// and a view holding another, committed so both can be read

import {
  appendChild,
  clearGlobalStyles,
  clearRegisteredProperties,
  createElement,
  createSurface,
  registerProperty,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { mounted } from './harness';

const ROOT_TAG = 1;

export function view(style: Record<string, unknown>): ISymbioteNode {
  const node = createElement('RCTView', false);
  setProp(node, 'style', style);
  return node;
}

export function mountTree(top: ISymbioteNode): void {
  const surface = createSurface(ROOT_TAG);
  surface.appendChild(top);
  surface.commit();
  mounted();
}

export function mountPair(
  outerStyle: Record<string, unknown>,
  innerStyle: Record<string, unknown>,
) {
  const outer = view(outerStyle);
  const inner = view(innerStyle);
  appendChild(outer, inner);
  mountTree(outer);
  return { outer, inner };
}

export function freshRegistry(): void {
  clearGlobalStyles();
  clearRegisteredProperties();
}

export function registerLength(
  name: string,
  initialValue: string,
  inherits: boolean,
): void {
  registerProperty({ name, syntax: '<length>', inherits, initialValue });
}
