// The census a benchmark reads off the logical tree: what exists, and what the page never gets

import type { ITreeCensus } from '@symbiote-native/engine';
import { RETAINED_KIND } from '@symbiote-native/engine/retained-visitor';
import type { IDomNode } from './dom-node';

// An anchor stands for its children, a void for nothing, an empty raw text for no text node
function isSkipped(node: IDomNode): boolean {
  if (node.kind === RETAINED_KIND.anchor) return true;
  if (node.kind === RETAINED_KIND.void) return true;
  return node.kind === RETAINED_KIND.text && node.props.text === '';
}

function tally(
  node: IDomNode,
  isUnderVoid: boolean,
  census: ITreeCensus,
): void {
  census.nodes += 1;
  if (node.kind === RETAINED_KIND.anchor) census.anchors += 1;
  if (node.kind === RETAINED_KIND.text && node.props.text === '') {
    census.emptyRawTexts += 1;
  }
  if (!isUnderVoid && !isSkipped(node)) census.renderable += 1;
  if (!isUnderVoid && node.children.some(isSkipped)) {
    census.flattenWidths.push(node.children.length);
  }
  const isVoidHere = isUnderVoid || node.kind === RETAINED_KIND.void;
  for (const child of node.children) tally(child, isVoidHere, census);
}

export function censusOf(roots: readonly IDomNode[]): ITreeCensus {
  const census: ITreeCensus = {
    nodes: 0,
    anchors: 0,
    emptyRawTexts: 0,
    renderable: 0,
    flattenWidths: [],
  };
  for (const root of roots) tally(root, false, census);
  census.flattenWidths.sort((a, b) => b - a);
  return census;
}
