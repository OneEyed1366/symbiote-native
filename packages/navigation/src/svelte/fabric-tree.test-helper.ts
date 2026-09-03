// Live-tree walkers the smoke tests in this folder share.
//
// `fabric.find()` (from @symbiote-native/test-utils) walks the CREATION log, not the current
// tree: a node it returns stays "found" forever, and its `props` reflect creation time rather
// than what is currently committed (svelte-adapter-dom-shim skill §15). Every assertion about
// what is on screen NOW - "this route is gone after a pop", "this header currently carries this
// title" - therefore walks `fabric.appRoot()` instead.

export type IFabricNode = {
  viewName?: string;
  props?: Record<string, unknown>;
  children?: IFabricNode[];
  instanceHandle?: unknown;
};

function isFabricNode(value: unknown): value is IFabricNode {
  return typeof value === 'object' && value !== null;
}

export function walkLive(
  root: unknown,
  visit: (node: IFabricNode) => void,
): void {
  if (!isFabricNode(root)) return;
  visit(root);
  for (const child of root.children ?? []) walkLive(child, visit);
}

export function findAllLive(root: unknown, viewName: string): IFabricNode[] {
  const found: IFabricNode[] = [];
  walkLive(root, node => {
    if (node.viewName === viewName) found.push(node);
  });
  return found;
}

export function findLive(
  root: unknown,
  viewName: string,
): IFabricNode | undefined {
  return findAllLive(root, viewName)[0];
}

export function countLive(root: unknown, viewName: string): number {
  return findAllLive(root, viewName).length;
}

export function findLiveByTestId(
  root: unknown,
  testID: string,
): IFabricNode | undefined {
  let found: IFabricNode | undefined;
  walkLive(root, node => {
    if (found === undefined && node.props?.testID === testID) found = node;
  });
  return found;
}

const TEXT_CONTAINER_VIEW_NAMES = new Set(['RCTText', 'RCTVirtualText']);

// Every raw text committed under a parent that cannot hold one - an invalid Fabric child.
// The gap Svelte leaves between two sibling tags compiles to a ' ' text node, and the shim
// drops it exactly when the parent takes no raw text (dom-shim/text.ts, svelte-adapter-dom-shim
// §16b); inside an RCTText the same string is a real word separator and must survive. So the
// parent, not the string, is what makes a raw text legal, and this returns the ones that are
// not. Formatted `viewName > "text"` so a failure names the offender.
export function rawTextsOutsideTextContainer(root: unknown): string[] {
  const found: string[] = [];
  const visit = (node: unknown, parent: IFabricNode | undefined): void => {
    if (!isFabricNode(node)) return;
    const parentName = parent?.viewName;
    if (
      node.viewName === 'RCTRawText' &&
      (parentName === undefined || !TEXT_CONTAINER_VIEW_NAMES.has(parentName))
    ) {
      found.push(`${String(parentName)} > ${JSON.stringify(node.props?.text)}`);
    }
    for (const child of node.children ?? []) visit(child, node);
  };
  visit(root, undefined);
  return found;
}

// A depth-indented `viewName` outline, for asserting the exact committed SHAPE (which is what
// catches a stray whitespace text node, an extra wrapper, or a missing header).
export function outline(root: unknown): string[] {
  const lines: string[] = [];
  const visit = (node: unknown, depth: number): void => {
    if (!isFabricNode(node)) return;
    lines.push(`${'  '.repeat(depth)}${String(node.viewName)}`);
    for (const child of node.children ?? []) visit(child, depth + 1);
  };
  visit(root, 0);
  return lines;
}
