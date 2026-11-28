// Drives the renderer ops straight, for tests that need no compiled component
// The surface joins `liveSurfaces` the way `mount` does, so an insert commits like it would live

import {
  createSurface,
  disposeRoot,
  isSymbioteNode,
  type ISymbioteNode,
  type SymbioteSurface,
} from '@symbiote-native/engine';
import { liveSurfaces } from './active-surface';
import { createRootElement } from './root-element';

export type IRendererHarness = {
  open: () => void;
  close: () => void;
  /** A fresh `view` wrapper appended to the surface, the node a test inserts into */
  liveRoot: () => ISymbioteNode;
  /** Waits for the coalesced commit */
  settle: () => Promise<void>;
};

export function createRendererHarness(rootTag: number): IRendererHarness {
  let surface: SymbioteSurface | undefined;
  return {
    open() {
      surface = createSurface(rootTag);
      liveSurfaces.add(surface);
    },
    close() {
      if (surface !== undefined) liveSurfaces.delete(surface);
      disposeRoot(rootTag);
      surface = undefined;
    },
    liveRoot() {
      if (surface === undefined) throw new Error('harness is not open');
      return createRootElement(surface);
    },
    settle: () => new Promise(resolve => setTimeout(resolve, 0)),
  };
}

// Short lists are cheap, so only a scan over a standing list is a cost worth counting
const LONG_LIST = 100;

export type INodeScanCounter = {
  /** Stops counting and returns the `indexOf` calls that looked a node up in a long list */
  stop: () => number;
};

// Counts linear node lookups, the O(n) per insert that makes a keyed each-block O(n squared)
export function countLongNodeScans(): INodeScanCounter {
  const realIndexOf = Array.prototype.indexOf;
  let scans = 0;
  Array.prototype.indexOf = function (
    this: unknown[],
    searchElement: unknown,
    fromIndex?: number,
  ): number {
    if (this.length >= LONG_LIST && isSymbioteNode(searchElement)) scans += 1;
    return realIndexOf.call(this, searchElement, fromIndex);
  };
  return {
    stop: () => {
      Array.prototype.indexOf = realIndexOf;
      return scans;
    },
  };
}
