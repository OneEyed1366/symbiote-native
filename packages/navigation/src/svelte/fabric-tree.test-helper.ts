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

export function walkLive(root: unknown, visit: (node: IFabricNode) => void): void {
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

export function findLive(root: unknown, viewName: string): IFabricNode | undefined {
  return findAllLive(root, viewName)[0];
}

export function countLive(root: unknown, viewName: string): number {
  return findAllLive(root, viewName).length;
}

export function findLiveByTestId(root: unknown, testID: string): IFabricNode | undefined {
  let found: IFabricNode | undefined;
  walkLive(root, node => {
    if (found === undefined && node.props?.testID === testID) found = node;
  });
  return found;
}

// Svelte's own mount bootstrap and block-boundary codegen (`{#if}`/`{#each}`/component-root
// dynamic blocks) create real, empty `RCTRawText` nodes as positional markers — never touched by
// `setText` again after creation (svelte-adapter-custom-renderer skill, native-node-parity.test.ts's
// `isSvelteBootstrapAnchor`). They commit like any other node (the engine's `isAnchor` check only
// recognizes `createComment`/`createAnchor` nodes, not an empty-string raw text node), so they'd
// otherwise pollute every outline assertion in this file's consumers with test-irrelevant noise.
function isSvelteBootstrapAnchor(node: IFabricNode): boolean {
  return node.viewName === 'RCTRawText' && node.props?.text === '';
}

// A depth-indented `viewName` outline, for asserting the exact committed SHAPE (which is what
// catches a stray whitespace text node, an extra wrapper, or a missing header).
export function outline(root: unknown): string[] {
  const lines: string[] = [];
  const visit = (node: unknown, depth: number): void => {
    if (!isFabricNode(node) || isSvelteBootstrapAnchor(node)) return;
    lines.push(`${'  '.repeat(depth)}${String(node.viewName)}`);
    for (const child of node.children ?? []) visit(child, depth + 1);
  };
  visit(root, 0);
  return lines;
}
