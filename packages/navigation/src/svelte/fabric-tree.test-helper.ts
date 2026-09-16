// The live-tree walkers the smoke tests in this folder share, over the shared reader.
//
// Everything general — walking the LIVE child links instead of the creation log, flattening
// anchors the way the commit walk does, the two readings of a node — lives in
// `@symbiote-native/test-utils`'s `createLiveTree`. See its header for why each of those is not
// optional. What stays here is the two questions only this folder asks.

import {
  createLiveTree,
  type IRecordingHost,
} from '@symbiote-native/test-utils';
import type { ILiveNode, ILiveTree } from '@symbiote-native/test-utils';
import type { ISymbioteNode } from '@symbiote-native/engine';

export type IFabricNode = ILiveNode;

export type INavigationLiveTree = ILiveTree & {
  findAllLive: (root: ISymbioteNode, viewName: string) => ILiveNode[];
  findLive: (root: ISymbioteNode, viewName: string) => ILiveNode | undefined;
  countLive: (root: ISymbioteNode, viewName: string) => number;
  findLiveByTestId: (
    root: ISymbioteNode,
    testID: string,
  ) => ILiveNode | undefined;
  rawTextsOutsideTextContainer: (root: ISymbioteNode) => string[];
};

const TEXT_CONTAINER_VIEW_NAMES = new Set(['RCTText', 'RCTVirtualText']);

export function createNavigationLiveTree(
  fabric: IRecordingHost,
): INavigationLiveTree {
  const live = createLiveTree(fabric);
  const byName = (root: ISymbioteNode, viewName: string): ILiveNode[] =>
    live.findAllLive(root, node => node.viewName === viewName);

  return {
    ...live,
    findAllLive: byName,
    findLive: (root, viewName) => byName(root, viewName)[0],
    countLive: (root, viewName) => byName(root, viewName).length,
    findLiveByTestId: (root, testID) =>
      live.findLive(root, node => node.props.testID === testID),

    // Every raw text under a parent that cannot hold one - an invalid Fabric child. The gap Svelte
    // leaves between two sibling tags compiles to a ' ' text node, and the shim drops it exactly
    // when the parent takes no raw text (dom-shim/text.ts, svelte-adapter-dom-shim §16b); inside an
    // RCTText the same string is a real word separator and must survive. So the parent, not the
    // string, is what makes a raw text legal, and this returns the ones that are not. Formatted
    // `viewName > "text"` so a failure names the offender.
    rawTextsOutsideTextContainer: (root): string[] => {
      const found: string[] = [];
      const visit = (node: ILiveNode, parentName: string | undefined): void => {
        if (
          node.viewName === 'RCTRawText' &&
          (parentName === undefined ||
            !TEXT_CONTAINER_VIEW_NAMES.has(parentName))
        ) {
          found.push(
            `${String(parentName)} > ${JSON.stringify(node.props.text)}`,
          );
        }
        for (const child of node.children) visit(child, node.viewName);
      };
      visit(live.nodeOf(root), undefined);
      return found;
    },
  };
}
