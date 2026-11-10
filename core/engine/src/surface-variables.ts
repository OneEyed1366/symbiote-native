// `setProperty('--x', v)` on the document root and `getPropertyValue('--x')` on an element

import { recordSetVariable } from './mutation-buffer';
import type { ISymbioteNode } from './node-types';
import { flushOps, treeHost } from './tree-host';

const CUSTOM_PROPERTY_PREFIX = '--';

/** Writes `name` on the surface, `undefined` removes it. Every reader below it restyles */
export function setVariable(
  surface: number,
  name: string,
  value: string | undefined,
): void {
  if (!name.startsWith(CUSTOM_PROPERTY_PREFIX)) {
    throw new Error(`setVariable: "${name}" is not a custom property (--name)`);
  }
  recordSetVariable(surface, name, value);
}

/** What a `var()` on the node would read now, or '' when nothing declares the name */
export function getComputedVariable(node: ISymbioteNode, name: string): string {
  flushOps();
  return treeHost()?.readVariable?.(node, name) ?? '';
}
