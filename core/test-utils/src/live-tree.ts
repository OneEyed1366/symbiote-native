/**
 * Reading the tree that is ON SCREEN, over the recording host.
 *
 * **This is not a second tree.** It derives nothing and decides nothing: the children come from the
 * engine's own child links, the view name from `componentOf`, the props from `propsOf`, the payload
 * from the engine's own `fabricProps`. It is a lens, and the reason it has to exist as one is that
 * the obvious alternative is wrong in a way that passes.
 *
 * **`host.find` searches the CREATION LOG.** A recording remembers every node it ever saw created,
 * so a node the app removed ten renders ago still answers it. Half of what a converted test asks is
 * a residency question — a popped route, an evicted list cell, a portal toggled off — and phrased
 * against the record, "this is gone" passes forever whatever the adapter did. Those questions walk
 * the LIVE child links from a known root, which is what everything here does.
 *
 * **Anchors are FLATTENED**, the commit walk's own rule (`renderableChildren`). An anchor is
 * structural bookkeeping nothing native ever sees, so its children stand in its place. It is not a
 * detail on two adapters: Svelte leaves an anchor per block, Angular one per composed component,
 * and a positional read that counts them is reading a different tree than the one it means.
 *
 * The one fact taken from the recording rather than the engine is `instanceHandle` — the object the
 * engine gives Fabric per element, which `fireEvent` has to be aimed at. That is why this binds a
 * host at all.
 */

import {
  childrenOf,
  componentOf,
  fabricProps,
  isAnchor,
  propsOf,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import type { IRecordingHost } from './recording-host';

/** A node as it currently stands, with both of its readings and its renderable children. */
export type ILiveNode = {
  /** The Fabric view name it CURRENTLY resolves to — `componentOf`, not the name it was created under. */
  viewName: string;
  /**
   * The INTRINSIC tag the engine was told, or `''` for a node no behavior attached to.
   *
   * What the host was TOLD, as against what a rule made of it — which is the only durable way to
   * locate a node whose platform props are a tag rule in `SymbioteFabricProps.cpp`. The payload
   * this type exposes is built by the TypeScript `fabricProps`, which deliberately carries no copy
   * of those rules, so a locator written as `payload.<key the rule writes>` finds nothing. Several
   * were, and expired together the day the sticky pin moved.
   */
  tagName: string;
  /** The author's bag: `style` is still an object, the RN processors have not run. */
  props: Readonly<Record<string, unknown>>;
  /** What the engine would hand the renderer: style flattened, the aria fold and processors run. */
  readonly payload: Record<string, unknown>;
  handle: ISymbioteNode;
  /** What `fireEvent` must be aimed at; `undefined` for a raw text or an anchor. */
  instanceHandle: unknown;
  /** The renderable children, anchors flattened. A getter, so a walk costs only what it reads. */
  readonly children: ILiveNode[];
};

export type ILiveTree = {
  /**
   * The app's own root — one `box-none` container, the same node `installFabric`'s `appRoot()`
   * returned. Note it is the SURFACE node, and the trees disagree about its NAME: it is created as
   * an `RCTView` and then set to the surface component, so the recording says `RCTView`,
   * `componentOf` says `#surface`, and Fabric commits it as `RootView`.
   */
  appRoot: () => ISymbioteNode;
  /** One handle as a readable node — the entry point for a positional walk from a known root. */
  nodeOf: (handle: ISymbioteNode) => ILiveNode;
  /** Pre-order, the root included. */
  walkLive: (root: ISymbioteNode, visit: (node: ILiveNode) => void) => void;
  findAllLive: (
    root: ISymbioteNode,
    predicate: (node: ILiveNode) => boolean,
  ) => ILiveNode[];
  findLive: (
    root: ISymbioteNode,
    predicate: (node: ILiveNode) => boolean,
  ) => ILiveNode | undefined;
  /** A depth-indented `viewName` outline, for asserting an exact shape. */
  outline: (root: ISymbioteNode) => string[];
  /**
   * The subtree as one line — `RCTView(RCTText(RCTRawText "hello"))`.
   *
   * Byte-compatible with the string the stand-in's own `serialize` produced, so a converted
   * expectation does not have to be rewritten: same bracketing, same empty separator between
   * siblings, the raw text's own string quoted after its name. It reads the FLATTENED tree, which
   * is the right comparison — the committed tree it is being read against cannot hold an anchor.
   */
  serialize: (root: ISymbioteNode) => string;
  /**
   * Every raw text under `root`, in TREE order — what the screen currently says.
   *
   * Tree order is the half a search over the recording cannot give: the record is in CREATION
   * order, and for a list that reorders its rows the two disagree without either being wrong.
   */
  texts: (root: ISymbioteNode) => string[];
};

export function createLiveTree(host: IRecordingHost): ILiveTree {
  const kidsOf = (handle: ISymbioteNode): ISymbioteNode[] =>
    childrenOf(handle).flatMap(child =>
      isAnchor(child) ? kidsOf(child) : [child],
    );

  const nodeOf = (handle: ISymbioteNode): ILiveNode => ({
    viewName: componentOf(handle),
    tagName: host.find(one => one.handle === handle)?.tagName ?? '',
    props: propsOf(handle),
    get payload(): Record<string, unknown> {
      return fabricProps(handle, propsOf(handle));
    },
    handle,
    instanceHandle: host.find(one => one.handle === handle)?.instanceHandle,
    get children(): ILiveNode[] {
      return kidsOf(handle).map(nodeOf);
    },
  });

  const walkLive = (
    root: ISymbioteNode,
    visit: (node: ILiveNode) => void,
  ): void => {
    visit(nodeOf(root));
    for (const child of kidsOf(root)) walkLive(child, visit);
  };

  const findAllLive = (
    root: ISymbioteNode,
    predicate: (node: ILiveNode) => boolean,
  ): ILiveNode[] => {
    const found: ILiveNode[] = [];
    walkLive(root, node => {
      if (predicate(node)) found.push(node);
    });
    return found;
  };

  return {
    nodeOf,
    walkLive,
    findAllLive,
    findLive: (root, predicate) => findAllLive(root, predicate)[0],

    appRoot: (): ISymbioteNode => {
      const root = host.find(node => node.props.pointerEvents === 'box-none');
      if (root === undefined) throw new Error('no app root was created');
      return root.handle;
    },

    serialize: (root): string => {
      const one = (handle: ISymbioteNode): string => {
        const name = componentOf(handle);
        const text =
          name === 'RCTRawText'
            ? ` "${String(fabricProps(handle, propsOf(handle)).text)}"`
            : '';
        const kids = kidsOf(handle);
        const nested = kids.length === 0 ? '' : `(${kids.map(one).join('')})`;
        return `${name}${text}${nested}`;
      };
      return one(root);
    },

    texts: (root): string[] => {
      const out: string[] = [];
      const visit = (handle: ISymbioteNode): void => {
        if (componentOf(handle) === 'RCTRawText') {
          out.push(String(fabricProps(handle, propsOf(handle)).text));
        }
        for (const child of kidsOf(handle)) visit(child);
      };
      visit(root);
      return out;
    },

    outline: (root): string[] => {
      const lines: string[] = [];
      const visit = (handle: ISymbioteNode, depth: number): void => {
        lines.push(`${'  '.repeat(depth)}${componentOf(handle)}`);
        for (const child of kidsOf(handle)) visit(child, depth + 1);
      };
      visit(root, 0);
      return lines;
    },
  };
}

/** How many nodes the adapter allocated, and how many of those are anchors. */
export type ILiveCensus = {
  /** Every retained node in the subtree, anchors INCLUDED. */
  nodes: number;
  anchors: number;
  /** `nodes - anchors`: what the adapter allocated for something the app actually wrote. */
  nonAnchors: number;
};

/**
 * Count the retained subtree, asking no host.
 *
 * This replaces `censusRetainedTree` in the anchor-cost probes, and the replacement is not a
 * convenience. `censusRetainedTree` delegates to `treeHost().census()`, which the TypeScript applier
 * answers truthfully and NOTHING ELSE does — the native host returns zeroes deliberately (census is
 * off the ABI, `native-tree-host.ts` says why), so a probe reading it on a device has always seen
 * nothing. A number only the stand-in can produce is the definition of a mirror measurement.
 *
 * What those probes actually claim is about the ENGINE: how many nodes the adapter allocated, and
 * how many of them are anchors. Both are read here off the engine's own child links and its own
 * `isAnchor`, so the count means the same thing under every host.
 *
 * It does NOT answer the applier's `renderable`, and that is deliberate: `renderable` subtracts the
 * empty raw texts as well, which is the COMMIT's rule and not the tree's. `empty-raw-text.itest.ts`
 * is where that one is settled, against the real commit.
 *
 * The walk does not flatten anchors — it is counting them, which is the opposite of what `walkLive`
 * is for.
 *
 * Variadic, because a surface holds a LIST of top-level nodes: `censusLive(...surface.children)`.
 */
export function censusLive(...roots: readonly ISymbioteNode[]): ILiveCensus {
  let nodes = 0;
  let anchors = 0;
  const visit = (handle: ISymbioteNode): void => {
    nodes += 1;
    if (isAnchor(handle)) anchors += 1;
    for (const child of childrenOf(handle)) visit(child);
  };
  for (const root of roots) visit(root);
  return { nodes, anchors, nonAnchors: nodes - anchors };
}
