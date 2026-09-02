// One shared fake `nativeFabricUIManager` for the unit suite. `installFabric()` puts a
// fresh recording slot on `globalThis` and returns a handle to inspect what was committed.
//
// Mirrors real Fabric's clone-on-write semantics: every clone gets a NEW identity;
// `*NewProps` MERGES the diff onto previous props (the engine always sends a minimal diff —
// see `diffProps` in commit.ts). A removed key arrives as literal `null` and stays `null`,
// not deleted, so a test can tell "explicitly reset" apart from "never set". `*Children`
// variants reset children (the engine re-appends).

export interface IFakeNode {
  tag: number;
  viewName: string;
  props: Record<string, unknown>;
  children: IFakeNode[];
  instanceHandle: unknown;
  /** Fabric family parent. Clones keep the same tag/family, so reparenting a family is illegal. */
  parentFamilyTag?: number;
}

export type IEventHandler = (
  instanceHandle: unknown,
  topLevelType: string,
  nativeEvent: Record<string, unknown>,
) => void;

export interface IFabricRecorder {
  /** The child set handed to the most recent `completeRoot`. */
  committed: IFakeNode[];
  /** Every node ever `createNode`'d this run (clones excluded). */
  created: IFakeNode[];
  /** Every imperative command dispatched at a committed Fabric node. */
  commands: Array<{
    node: IFakeNode;
    commandName: string;
    args: readonly unknown[];
  }>;
  /**
   * Call counters, for tests that assert "exactly N native nodes were created" — and for pricing
   * a commit's PROTOCOL half against its walk half. `appendChild` and `clone` are the two Fabric
   * makes unavoidable: a parent whose child set changed is cloned empty and re-appends every child
   * handle, so those counts are what a real JSI boundary would charge no matter how cheap the JS
   * walk above them gets. Counting them here is the only way a headless run can say which half a
   * proposed optimisation is even aimed at.
   */
  counts: {
    createNode: number;
    completeRoot: number;
    appendChild: number;
    clone: number;
  };
  /**
   * RN wraps every commit in a synthetic `box-none` AppContainer root.
   * Returns it, asserting it is the single expected root, so each test unwraps the
   * AppContainer the same way instead of re-checking the invariant by hand.
   */
  appRoot(): IFakeNode;
  /** Find the first `createNode`'d node matching a predicate (e.g. the app's own View). */
  find(predicate: (node: IFakeNode) => boolean): IFakeNode | undefined;
  /** Deliver a native event to the renderer's registered handler. */
  fireEvent(
    handle: unknown,
    topLevelType: string,
    nativeEvent?: Record<string, unknown>,
  ): void;
  /** Serialize a node list to `RCTView(RCTText(RCTRawText "text"))` shorthand. */
  serialize(nodes: IFakeNode[]): string;
  /** Zero the counters and clear `committed` / `created` (the event handler survives). */
  reset(): void;
}

// See the header comment above for the merge/null-removal semantics this mirrors.
function mergeFabricProps(
  previous: Record<string, unknown>,
  diff: Record<string, unknown>,
): Record<string, unknown> {
  return { ...previous, ...diff };
}

// Fabric clones keep the node's FAMILY, so a handle that already belongs to one parent can never
// be appended under another. Enforced on both routes into a parent's child list — the append loop
// and the batched clone — so switching between them cannot quietly drop the check.
function assertSameFamily(parent: IFakeNode, child: IFakeNode): void {
  if (
    child.parentFamilyTag !== undefined &&
    child.parentFamilyTag !== parent.tag
  ) {
    throw new Error(
      `Fabric family reparent: child ${child.viewName}#${child.tag} already belongs to parent #${child.parentFamilyTag}, cannot append to ${parent.viewName}#${parent.tag}`,
    );
  }
}

// `Array.isArray` narrows to `any[]`, which leaves the OTHER branch of the union un-narrowed;
// an explicit predicate keeps both sides typed without a cast.
function isFakeNodeList(
  value: readonly IFakeNode[] | Record<string, unknown>,
): value is readonly IFakeNode[] {
  return Array.isArray(value);
}

// A clone with no child list comes back EMPTY, exactly as the real binding does.
function adoptChildren(
  parent: IFakeNode,
  children: readonly IFakeNode[] | undefined,
): IFakeNode[] {
  if (children === undefined) return [];
  for (const child of children) {
    assertSameFamily(parent, child);
    child.parentFamilyTag = parent.tag;
  }
  return [...children];
}

export function installFabric(): IFabricRecorder {
  let committed: IFakeNode[] = [];
  const created: IFakeNode[] = [];
  const commands: Array<{
    node: IFakeNode;
    commandName: string;
    args: readonly unknown[];
  }> = [];
  const counts = { createNode: 0, completeRoot: 0, appendChild: 0, clone: 0 };
  let eventHandler: IEventHandler | undefined;

  const slot = {
    createNode(
      tag: number,
      viewName: string,
      _rootTag: number,
      props: Record<string, unknown>,
      instanceHandle: unknown,
    ): IFakeNode {
      counts.createNode += 1;
      const node: IFakeNode = {
        tag,
        viewName,
        props,
        children: [],
        instanceHandle,
      };
      created.push(node);
      return node;
    },
    cloneNodeWithNewProps: (
      node: IFakeNode,
      newProps: Record<string, unknown>,
    ): IFakeNode => {
      counts.clone += 1;
      return { ...node, props: mergeFabricProps(node.props, newProps) };
    },
    // Both clone-with-children forms take the child list as an OPTIONAL trailing/second argument,
    // mirroring UIManagerBinding.cpp: `cloneNodeWithNewChildren(node, children?)` and the 3-arg
    // `cloneNodeWithNewChildrenAndProps(node, children, props)`. The engine probes support by
    // ARITY, so these must keep 2 and 3 declared parameters — a default value on any of them
    // would drop `.length` below the threshold and silently send every test down the append loop.
    cloneNodeWithNewChildren: (
      node: IFakeNode,
      children?: readonly IFakeNode[],
    ): IFakeNode => {
      counts.clone += 1;
      return { ...node, children: adoptChildren(node, children) };
    },
    cloneNodeWithNewChildrenAndProps: (
      node: IFakeNode,
      childrenOrProps: readonly IFakeNode[] | Record<string, unknown>,
      maybeProps?: Record<string, unknown>,
    ): IFakeNode => {
      counts.clone += 1;
      const children = isFakeNodeList(childrenOrProps)
        ? childrenOrProps
        : undefined;
      const newProps = isFakeNodeList(childrenOrProps)
        ? (maybeProps ?? {})
        : childrenOrProps;
      return {
        ...node,
        props: mergeFabricProps(node.props, newProps),
        children: adoptChildren(node, children),
      };
    },
    createChildSet: (): IFakeNode[] => [],
    appendChild(parent: IFakeNode, child: IFakeNode): IFakeNode {
      counts.appendChild += 1;
      assertSameFamily(parent, child);
      child.parentFamilyTag = parent.tag;
      parent.children.push(child);
      return parent;
    },
    appendChildToSet(childSet: IFakeNode[], child: IFakeNode): void {
      childSet.push(child);
    },
    completeRoot(_rootTag: number, childSet: IFakeNode[]): void {
      counts.completeRoot += 1;
      committed = childSet;
    },
    registerEventHandler(handler: IEventHandler): void {
      eventHandler = handler;
    },
    dispatchCommand(
      node: IFakeNode,
      commandName: string,
      args: readonly unknown[],
    ): void {
      commands.push({ node, commandName, args });
    },
  };

  Object.assign(globalThis, { nativeFabricUIManager: slot });

  const serializeNode = (node: IFakeNode): string => {
    const text =
      node.viewName === 'RCTRawText' ? ` "${String(node.props.text)}"` : '';
    const kids = node.children.length
      ? `(${node.children.map(serializeNode).join('')})`
      : '';
    return `${node.viewName}${text}${kids}`;
  };

  return {
    get committed() {
      return committed;
    },
    created,
    commands,
    counts,
    appRoot(): IFakeNode {
      const root = committed[0];
      if (committed.length !== 1 || root?.props.pointerEvents !== 'box-none') {
        throw new Error(
          `expected a single box-none AppContainer root, got ${committed.length} node(s)`,
        );
      }
      return root;
    },
    find(predicate): IFakeNode | undefined {
      return created.find(predicate);
    },
    fireEvent(handle, topLevelType, nativeEvent = {}): void {
      if (!eventHandler)
        throw new Error('no event handler registered by the renderer');
      eventHandler(handle, topLevelType, nativeEvent);
    },
    serialize(nodes): string {
      return nodes.map(serializeNode).join('');
    },
    reset(): void {
      committed = [];
      created.length = 0;
      commands.length = 0;
      // Every counter, not a subset: `appendChild` and `clone` were left out, so any assertion
      // on them across a reset read the PREVIOUS phase's total and could not fail. Both are now
      // the metric that prices the clone protocol, so a stale one is a silent wrong answer.
      counts.createNode = 0;
      counts.completeRoot = 0;
      counts.appendChild = 0;
      counts.clone = 0;
    },
  };
}
