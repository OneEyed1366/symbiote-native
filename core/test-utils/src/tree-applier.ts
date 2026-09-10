// The shadow tree, in TypeScript — the reference half of `core/engine/cpp/SymbioteTree.cpp`.
//
// IT LIVES IN `core/test-utils`, and the placement is the invariant rather than a filing decision.
// `@symbiote-native/engine` must contain no tree at all: JS holds a command buffer and native turns
// it into a tree. This file builds `ITreeNode` with `children` / `parent` / `committed`, so it is a
// JS tree and may not ship inside the engine. `core/test-utils` is a devDependency of the adapters
// rather than a runtime one — the same reason `installFabric()`'s fake `nativeFabricUIManager` lives
// here — so nothing an app loads contains it.
//
// Two appliers consume ONE buffer. That is not a fallback and it is not two implementations of a
// contract: it is the shape that gives the C++ an oracle, now that Fantom is not available
// (`native-engine.ts` records why — the vendored tree is RN `main` while we ship 0.86.0, so a tester
// built from it would answer about a Fabric we do not ship).
//
//   headless   the adapter's ops -> THIS -> `installFabric()`'s fake slot
//   device     the same bytes    -> C++   -> the real UIManager
//
// So the ~473 tests that mount something and read the committed tree exercise this file on every
// run, and the C++ has only to AGREE with something already covered — rather than being the sole
// implementation of an uncovered algorithm.
//
// **Keep the two in step deliberately.** They are written to be read side by side — same node
// fields, same `materialize` / `appendRenderable` / `diffProps` split, same order of decisions. A
// divergence that is invisible here is a device-only bug, which is the most expensive kind this
// project produces.

import {
  KIND_ANCHOR,
  KIND_ELEMENT,
  KIND_RAW_TEXT,
  NO_VALUE,
  OP_APPEND_CHILD,
  OP_COMMIT,
  OP_CREATE_ANCHOR,
  OP_CREATE_ELEMENT,
  OP_CREATE_RAW_TEXT,
  OP_INSERT_BEFORE,
  OP_REMOVE_CHILD,
  OP_SET_COMPONENT,
  OP_SET_PROP,
  OP_SET_TEXT,
  OP_STRIDE,
  type IMutationBatch,
} from '@symbiote-native/engine/mutation-buffer';
import {
  fabricProps,
  getSlot,
  isSymbioteNode,
  type IFabricNode,
  type IFabricProps,
  type IFabricSlot,
  type ITreeCensus,
  type ITreeHost,
} from '@symbiote-native/engine';

const RAW_TEXT_VIEW_NAME = 'RCTRawText';

// Diagnostics only. A batch is a flat Int32Array, so an unresolvable slot reported by NUMBER says
// nothing about which mutation went wrong — and the opcode is nearly always the useful half.
const OP_NAMES: Record<number, string> = {
  [OP_CREATE_ELEMENT]: 'createElement',
  [OP_CREATE_RAW_TEXT]: 'createRawText',
  [OP_CREATE_ANCHOR]: 'createAnchor',
  [OP_APPEND_CHILD]: 'appendChild',
  [OP_INSERT_BEFORE]: 'insertBefore',
  [OP_REMOVE_CHILD]: 'removeChild',
  [OP_SET_COMPONENT]: 'setComponent',
  [OP_SET_PROP]: 'setProp',
  [OP_SET_TEXT]: 'setText',
  [OP_COMMIT]: 'commit',
};

function describeHandle(handle: object): string {
  if (typeof handle !== 'object' || handle === null) return String(handle);
  const component: unknown = Reflect.get(handle, 'component');
  if (typeof component === 'string') return `<${component}>`;
  // A handle that is not one of ours: name its shape, because "handle" alone leaves the reader with
  // the same question the throw was meant to answer.
  return `a ${handle.constructor.name} {${Object.keys(handle).slice(0, 6).join(',')}}`;
}

/**
 * The one position-dependent view name. A text element inside another text element commits as a
 * virtual span — and the flag is STICKY, so `<Text><View><Text>` is virtual too. That stickiness is
 * why the name is resolved while the child set is built rather than when a node is inserted: an
 * insert cannot see the whole chain, and a reparent would otherwise have to rewrite a subtree.
 */
const VIRTUAL_TEXT_VIEW_NAME = 'RCTVirtualText';

/**
 * A node in OUR tree, which is not Fabric's tree.
 *
 * The distinction is load-bearing and it is the one thing the old `IMirror` was genuinely for: an
 * ANCHOR has no Fabric counterpart at all, so a store that WAS the Fabric tree could not hold one —
 * and the frameworks put anchors everywhere (`{#if}`, a fragment, a `{@render}` slot).
 */
interface ITreeNode {
  kind: number;
  isText: boolean;
  /** The object the ops address this node by — what the engine holds, and what a read names. */
  handle: object;
  /** As the adapter authored it. `committedViewName` is what was sent, which differs when the
   *  virtual-text rule fired. */
  viewName: string;
  tag: number;
  props: Record<string, unknown>;
  instanceHandle: unknown;
  children: ITreeNode[];
  parent: ITreeNode | undefined;
  committed: IFabricNode | undefined;
  /** The surface this node last committed into — the imperative APIs need it to name a root. */
  committedRootTag: number;
  /** What the last commit actually sent, so the next payload can be a minimal diff. */
  committedProps: Record<string, unknown>;
  committedViewName: string;
  /**
   * The node that held this one in FABRIC at the last commit — the nearest non-anchor ancestor,
   * since an anchor hoists and has no Fabric counterpart. `undefined` means the surface's child set.
   *
   * A Fabric node belongs to one FAMILY, so a node handed to a different parent must be re-created
   * rather than cloned; the fake host asserts this and the real one is what the assertion mirrors.
   * A move is also the one case where a node can be perfectly CLEAN and still need rebuilding,
   * which is why this is checked separately from the dirty pair rather than folded into it.
   */
  committedParent: ITreeNode | undefined;
  /**
   * The text ancestry this node last committed UNDER — not a property of the node, which is why it
   * has to be recorded rather than derived. A node that is perfectly clean still commits a different
   * subtree when the answer flips: `<View><Text>` sends `RCTText`, and the same two nodes moved
   * under a `<Text>` send `RCTVirtualText`. The View itself changes neither name nor parent, so
   * without this it reuses its handle and the Text below it is never re-resolved.
   */
  committedTextAncestor: boolean;
  /**
   * The Fabric children it last handed over, so a rebuild that produces the identical list can
   * decline to clone. A node is DIRTY whenever an op named it, and an op is not a change: an adapter
   * that re-renders the same content writes a fresh object literal for an unchanged style, which
   * every identity guard above `diffProps` must let through by design.
   */
  committedChildren: readonly IFabricNode[];
  /**
   * A SURFACE only: the root child set it last handed to `completeRoot`, so a commit that rebuilds
   * the identical list can decline to complete the root at all. Empty on every other node.
   */
  committedRenderable: readonly IFabricNode[];
  /**
   * Which RECORDER generation the memo above belongs to.
   *
   * `installFabric()`'s `reset()` throws away everything the recorder has seen while this tree keeps
   * standing, so without it a surface whose content did not change would decline to complete its
   * root and the recorder would stay empty — a test reading `fabric.committed` after a reset sees
   * nothing and the skip looks like a lost commit.
   */
  committedGeneration: number;
  /** This node's own props or child list changed. */
  selfDirty: boolean;
  /** Something at or below it did — what lets an untouched sibling subtree skip the walk entirely. */
  pathDirty: boolean;
}

/**
 * Handle -> node. The JS twin of the C++ `NativeState`: same keying, same weakness, same lifetime.
 *
 * Weak because it must not be what keeps a node alive. A node lives while a PARENT holds it (through
 * `children` below) or while the adapter names it through this handle, and dies otherwise — the
 * browser's rule, and the reason nothing here needs an explicit release.
 */
const nodes = new WeakMap<object, ITreeNode>();

/**
 * Bumped by `installFabric()`'s `reset()`. The commit skip below memoizes what a surface last handed
 * to `completeRoot`, and a reset throws that away on the RECORDER's side only — so the memo has to
 * carry the generation it was taken in, or the first commit after a reset is skipped and the
 * recorder stays empty.
 */
let recorderGeneration = 0;

export function forgetCommittedRoots(): void {
  recorderGeneration += 1;
}

// Tags identify a node to Fabric and must not collide with a surface's root tag. The base is far
// above any root tag a host hands out; the step is 2 to stay out of any contiguous range another
// allocator might use. Mirrors `nextTag_` in the C++.
let nextTag = 1 << 20;

function allocateTag(): number {
  const tag = nextTag;
  nextTag += 2;
  return tag;
}

function makeNode(kind: number, handle: object): ITreeNode {
  return {
    kind,
    isText: false,
    handle,
    viewName: '',
    tag: 0,
    props: {},
    instanceHandle: undefined,
    children: [],
    parent: undefined,
    committed: undefined,
    committedRootTag: 0,
    committedProps: {},
    committedViewName: '',
    committedParent: undefined,
    committedTextAncestor: false,
    committedChildren: [],
    committedRenderable: [],
    committedGeneration: -1,
    selfDirty: true,
    pathDirty: true,
  };
}

/**
 * Mark a node changed and raise `pathDirty` to the root.
 *
 * The climb stops at the first ancestor already marked, which keeps the invariant "pathDirty implies
 * pathDirty on every ancestor" and makes this O(1) amortised: after the first op in a subtree the
 * rest cost one comparison. A reparent is the case that could break the invariant — a dirty node
 * moved under a clean parent — so every structural op marks the PARENT, which repairs it by
 * construction.
 *
 * The early stop is only sound while EVERY node the commit walks clears its flags, and the nodes the
 * walk contributes nothing for are the ones that would not: an anchor and an empty raw text never
 * reach `materialize`. So `appendRenderable` clears them itself. Without that, an anchor keeps
 * `pathDirty` forever after its first commit, the climb halts AT it, and the element above it is
 * never marked — every mutation inside an `{#if}` that already committed is silently dropped.
 */
function markDirty(node: ITreeNode): void {
  node.selfDirty = true;
  for (
    let at: ITreeNode | undefined = node;
    at !== undefined && !at.pathDirty;
    at = at.parent
  ) {
    at.pathDirty = true;
  }
}

function detachFromParent(child: ITreeNode): void {
  const parent = child.parent;
  if (parent === undefined) return;
  const index = parent.children.indexOf(child);
  if (index >= 0) parent.children.splice(index, 1);
  child.parent = undefined;
  markDirty(parent);
}

/** Whether this node's own text makes it invisible. An empty `RCTRawText` would actually paint. */
function isEmptyRawText(node: ITreeNode): boolean {
  if (node.kind !== KIND_RAW_TEXT) return false;
  const text = node.props.text;
  return typeof text !== 'string' || text.length === 0;
}

/**
 * The minimal payload for a CLONE.
 *
 * Fabric MERGES a clone's raw props onto the node's existing ones, so a key the node no longer has
 * must be sent as an explicit `null` to reset it to the default, and an unchanged key must not be
 * sent at all — re-sending re-invokes that prop's native setter, and AndroidProgressBar's
 * `styleAttr` setter rebuilds the whole view. Mirrors React's own `diffProperties`.
 */
function diffProps(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): IFabricProps {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(next)) {
    if (!jsonEqual(previous[key], next[key])) out[key] = next[key];
  }
  for (const key of Object.keys(previous)) {
    if (!(key in next)) out[key] = null;
  }
  return out;
}

/** Structural equality over JSON-shaped prop values — Fabric props are serializable by contract. */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(key =>
    jsonEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
    ),
  );
}

/**
 * Put `node`'s Fabric contribution into `out` — which is zero, one, or several nodes.
 *
 * An ANCHOR contributes its own children in its place, recursively: it is a position marker the
 * framework inserted and it has no Fabric counterpart. An empty raw text contributes nothing. A
 * SURFACE reaches here as an anchor too, which is why a commit needs no `rootTag -> node` map.
 */
function appendRenderable(
  slot: IFabricSlot,
  out: IFabricNode[],
  node: ITreeNode,
  hasTextAncestor: boolean,
  rootTag: number,
  fabricParent: ITreeNode | undefined,
): void {
  if (node.kind === KIND_ANCHOR) {
    // The anchor is transparent, so its children's Fabric parent is the anchor's, not the anchor.
    for (const child of node.children) {
      appendRenderable(
        slot,
        out,
        child,
        hasTextAncestor,
        rootTag,
        fabricParent,
      );
    }
    // Walked, so its flags clear here — `materialize` never sees it. See `markDirty`.
    node.selfDirty = false;
    node.pathDirty = false;
    return;
  }
  if (isEmptyRawText(node)) {
    node.selfDirty = false;
    node.pathDirty = false;
    return;
  }
  out.push(materialize(slot, node, hasTextAncestor, rootTag, fabricParent));
}

/**
 * The node's logical props as the FLAT PAYLOAD Fabric wants — style keys hoisted to the top level,
 * colors and structured CSS values processed, function props dropped, the aria and per-behavior
 * folds run.
 *
 * `style` is not a Fabric prop name, so skipping this does not degrade: it blanks the screen.
 *
 * The fold itself stays in `@symbiote-native/engine` rather than moving here with the tree, because
 * three of its inputs are JS-side facts about the node that no bag carries — the authored component
 * name, the sticky `hasAriaAlias` flag, and the behavior's `payloadFold` closure. `SymbioteTree.cpp`
 * owes the same fold and does not have it yet.
 */
/** Element-wise identity. Fabric is clone-on-write, so an unchanged node IS the same object. */
function sameNodes(
  previous: readonly IFabricNode[],
  next: readonly IFabricNode[],
): boolean {
  if (previous.length !== next.length) return false;
  return previous.every((node, index) => node === next[index]);
}

function payloadOf(node: ITreeNode): IFabricProps {
  // A guard rather than a cast, and it degrades: a host handle that is not one of ours has no
  // component name to key the processors on, so its bag goes over unfolded rather than throwing.
  // COPIED, because the caller keeps the result as `committedProps` to diff the next commit
  // against — handing back the live bag makes every later diff compare an object with itself and
  // come back empty, which reads as "nothing changed" rather than as an error.
  if (!isSymbioteNode(node.handle)) return { ...node.props };
  return fabricProps(node.handle, node.props);
}

function materialize(
  slot: IFabricSlot,
  node: ITreeNode,
  hasTextAncestor: boolean,
  rootTag: number,
  fabricParent: ITreeNode | undefined,
): IFabricNode {
  const viewName =
    node.isText && hasTextAncestor ? VIRTUAL_TEXT_VIEW_NAME : node.viewName;
  // Two things force a FRESH FAMILY rather than a clone, and neither is visible in the dirty pair.
  //
  // A node whose view name flipped cannot be cloned into the other one — no prop write moves a node
  // between native views. And a node handed to a different parent cannot either: a Fabric node
  // belongs to one family, so a MOVE rebuilds even when the node itself is perfectly clean. That
  // second one is why `fabricParent` is threaded at all.
  const needsFreshFamily =
    node.committed !== undefined &&
    (viewName !== node.committedViewName ||
      node.committedParent !== fabricParent);

  // The reuse fast path needs the node to be clean AND its CONTEXT to be the one it committed under.
  // Those are two different questions: the dirty pair is about ops that named this subtree, and the
  // context is about a decision taken above it that the subtree's own payload depends on. A node
  // that moved keeps both flags false.
  //
  // Text ancestry is the sharp one, because a rebuild here is not about this node at all — a plain
  // `<View>` carried under a `<Text>` sends the identical payload under an identical name, and the
  // `<Text>` UNDER it has to switch to `RCTVirtualText`. Reuse and the whole subtree keeps the old
  // name, and only the first intermediate node has to be clean for it to happen.
  const contextHeld =
    node.committedTextAncestor === hasTextAncestor &&
    node.committedRootTag === rootTag;

  if (
    !node.selfDirty &&
    !node.pathDirty &&
    node.committed !== undefined &&
    !needsFreshFamily &&
    contextHeld
  ) {
    return node.committed;
  }

  const children: IFabricNode[] = [];
  // STICKY: once inside a text element everything below is virtual, including through a non-text
  // element in between.
  const childHasTextAncestor = hasTextAncestor || node.isText;
  for (const child of node.children) {
    appendRenderable(
      slot,
      children,
      child,
      childHasTextAncestor,
      rootTag,
      node,
    );
  }

  if (node.committed === undefined || needsFreshFamily) {
    if (node.tag === 0) node.tag = allocateTag();
    const payload = payloadOf(node);
    const created = slot.createNode(
      node.tag,
      viewName,
      rootTag,
      payload,
      node.instanceHandle,
    );
    for (const child of children) slot.appendChild(created, child);
    node.committed = created;
    node.committedProps = payload;
  } else if (node.selfDirty) {
    const next = payloadOf(node);
    const payload = diffProps(node.committedProps, next);
    // DIRTY is not CHANGED, and this is the only place that can tell them apart. An op names a node
    // whether or not it moved a value: a framework re-rendering identical content hands back a fresh
    // object literal for an unchanged style, and identity is all `setProp` and `pushClassStyle` have
    // to go on, so both correctly let it through. `diffProps` compares by VALUE and is the first
    // thing that can see there is nothing to send.
    //
    // Cloning anyway is not merely wasted work — a new handle propagates to the root and makes the
    // surface commit, so an app that re-renders the same tree pays a full `ShadowTree::commit`, with
    // layout and a mount pass, per render.
    const childrenHeld = sameNodes(node.committedChildren, children);
    if (Object.keys(payload).length === 0 && childrenHeld) {
      node.committedProps = next;
    } else if (childrenHeld) {
      // A CHILD LIST IS NOT A FREE ARGUMENT — mirrors `SymbioteTree.cpp`, which is where the cost
      // lives. Handing over an unchanged list makes Fabric re-adopt every child, and a child still
      // owned by its previous parent's yoga node is CLONED and swapped in behind the caller's back.
      // `cloneNodeWithNewProps` carries the children over untouched, which is what a props-only
      // change means; the engine this file replaced drew the same line (`commit.ts:569`).
      node.committed = slot.cloneNodeWithNewProps(node.committed, payload);
      node.committedProps = next;
    } else {
      node.committed = slot.supportsCloneWithChildren
        ? slot.cloneNodeWithNewChildrenAndProps(
            node.committed,
            payload,
            children,
          )
        : appendAll(
            slot,
            slot.cloneNodeWithNewProps(node.committed, payload),
            children,
          );
      node.committedProps = next;
    }
  } else if (!sameNodes(node.committedChildren, children)) {
    node.committed = slot.supportsCloneWithChildren
      ? slot.cloneNodeWithNewChildren(node.committed, children)
      : appendAll(
          slot,
          slot.cloneNodeWithNewChildren(node.committed),
          children,
        );
  }

  node.committedChildren = children;
  node.committedViewName = viewName;
  node.committedParent = fabricParent;
  node.committedTextAncestor = hasTextAncestor;
  node.committedRootTag = rootTag;
  node.selfDirty = false;
  node.pathDirty = false;
  return node.committed;
}

/**
 * The fallback for a host that ignores `cloneNode`'s child-list argument.
 *
 * Forwarded rather than assumed, because answering `true` for such a host commits a parent with no
 * children — a blank screen, not an error. Real Fabric supports it; the flag exists for a JS host
 * that does not.
 */
function appendAll(
  slot: IFabricSlot,
  parent: IFabricNode,
  children: readonly IFabricNode[],
): IFabricNode {
  for (const child of children) slot.appendChild(parent, child);
  return parent;
}

/**
 * Apply one batch, then commit whatever surfaces it named.
 *
 * The decode is a straight read of the `Int32Array` — the same bytes the C++ gets, which is the
 * whole point of running the encoded form headlessly rather than the record objects: the format is
 * exercised by every test in the repo instead of by a wire-format test alone.
 */
export function applyBatch(batch: IMutationBatch, slot: IFabricSlot): void {
  const { ops, strings, values, instanceHandles, handles } = batch;

  // `at` is threaded in only so the throw can name the OPCODE. A batch is a flat Int32Array, so
  // "slot 3 is unknown" on its own says nothing about which mutation went wrong, and the answer is
  // usually the op rather than the slot.
  const nodeAt = (slotIndex: number, at: number): ITreeNode => {
    const handle = handles[slotIndex];
    const found = handle === undefined ? undefined : nodes.get(handle);
    if (found === undefined) {
      const kind =
        handle === undefined
          ? 'outside this batch handle array'
          : `a ${describeHandle(handle)} this applier never saw created`;
      throw new Error(
        `symbiote engine: op ${OP_NAMES[ops[at] ?? -1] ?? ops[at]} names slot ` +
          `${slotIndex}, ${kind}`,
      );
    }
    return found;
  };

  const handleAt = (slotIndex: number): object => {
    const handle = handles[slotIndex];
    if (handle === undefined) {
      throw new Error(
        `symbiote engine: op names slot ${slotIndex}, outside the batch's handle array`,
      );
    }
    return handle;
  };

  for (let at = 0; at + OP_STRIDE <= ops.length; at += OP_STRIDE) {
    switch (ops[at]) {
      case OP_CREATE_ELEMENT: {
        const handle = handleAt(ops[at + 1]);
        const node = makeNode(KIND_ELEMENT, handle);
        node.viewName = strings[ops[at + 2]];
        node.isText = ops[at + 3] !== 0;
        node.tag = allocateTag();
        node.instanceHandle = instanceHandles[ops[at + 4]];
        nodes.set(handle, node);
        break;
      }
      case OP_CREATE_RAW_TEXT: {
        const handle = handleAt(ops[at + 1]);
        const node = makeNode(KIND_RAW_TEXT, handle);
        node.viewName = RAW_TEXT_VIEW_NAME;
        node.props.text = strings[ops[at + 2]];
        nodes.set(handle, node);
        break;
      }
      case OP_CREATE_ANCHOR: {
        const handle = handleAt(ops[at + 1]);
        nodes.set(handle, makeNode(KIND_ANCHOR, handle));
        break;
      }
      case OP_APPEND_CHILD: {
        const parent = nodeAt(ops[at + 1], at);
        const child = nodeAt(ops[at + 2], at);
        detachFromParent(child);
        child.parent = parent;
        parent.children.push(child);
        markDirty(parent);
        break;
      }
      case OP_INSERT_BEFORE: {
        const parent = nodeAt(ops[at + 1], at);
        const child = nodeAt(ops[at + 2], at);
        const before = nodeAt(ops[at + 3], at);
        detachFromParent(child);
        child.parent = parent;
        const index = parent.children.indexOf(before);
        parent.children.splice(
          index < 0 ? parent.children.length : index,
          0,
          child,
        );
        markDirty(parent);
        break;
      }
      case OP_REMOVE_CHILD: {
        const parent = nodeAt(ops[at + 1], at);
        const child = nodeAt(ops[at + 2], at);
        // Guarded rather than assumed: `detachFromParent` reads the child's OWN parent, which is the
        // truth even when the adapter names a stale one — frameworks spell a move as
        // remove-then-insert and can arrive here after the insert already re-parented the node.
        if (child.parent === parent) detachFromParent(child);
        break;
      }
      // Writing a value the node already holds is a NO-OP and returns before `markDirty`. Fabric
      // never saw a difference either way — `diffProps` would find the key unchanged and drop it —
      // but the mark is not free: it climbs to the first already-dirty ancestor and strips every one
      // of them of the reuse fast path, so an otherwise untouched subtree gets rebuilt purely to
      // prove it is untouched. Measured: Angular's Pressable host bag pushed 104 000 setProp calls
      // for a screen Solid built in 12 000, 90 000 of them writing `undefined` over a key that was
      // not there.
      //
      // The guard lives HERE and not in the engine's `setProp` because it needs the value the node
      // already holds — a read the engine would have to make over the wire, ~44 001 times on a
      // 1 000-row create, which is exactly the traffic this design removes. Here it is a local field.
      //
      // Two deliberate choices, both carried over:
      //
      // - `Object.hasOwn`, not `props[key] === undefined`. A key explicitly present holding
      //   `undefined` is not an absent key: deleting genuinely changes what the next `diffProps`
      //   sends, since a vanished key has to go out as an explicit `null`.
      // - `Object.is`, not a deep compare. A style object, an array, or a handler closure is a fresh
      //   reference on nearly every render, so the guard simply never fires for them — correct, since
      //   an adapter may hand back the SAME reference with mutated contents and identity cannot see
      //   that. A deep compare per prop write would cost more than the rebuild it saves.
      case OP_SET_PROP: {
        const node = nodeAt(ops[at + 1], at);
        const key = strings[ops[at + 2]];
        if (ops[at + 3] === NO_VALUE) {
          if (!Object.hasOwn(node.props, key)) break;
          delete node.props[key];
        } else {
          const value = values[ops[at + 3]];
          if (
            Object.hasOwn(node.props, key) &&
            Object.is(node.props[key], value)
          )
            break;
          node.props[key] = value;
        }
        markDirty(node);
        break;
      }
      // The same guard, and here it is strictly stronger: `text` is a string, so `Object.is` is a
      // real value comparison rather than the reference check it degrades to for a style object. A
      // framework that re-renders a subtree and hands back an unchanged label — every list row whose
      // text did not move, on every update — stops dirtying its ancestors.
      // The one op that changes what a node IS rather than what it holds. `materialize`'s
      // `needsFreshFamily` already covers the consequence — a name that differs from
      // `committedViewName` re-creates the node and re-parents its children — so this only has to
      // move the name and mark. `TextInput`'s `multiline` flip is the whole reason it exists.
      case OP_SET_COMPONENT: {
        const node = nodeAt(ops[at + 1], at);
        const viewName = strings[ops[at + 2]];
        if (node.viewName === viewName) break;
        node.viewName = viewName;
        markDirty(node);
        break;
      }
      case OP_SET_TEXT: {
        const node = nodeAt(ops[at + 1], at);
        const text = strings[ops[at + 2]];
        if (Object.is(node.props.text, text)) break;
        node.props.text = text;
        markDirty(node);
        // A write to or from '' takes this node out of its parent's renderable child list or puts it
        // back — a structural change to the PARENT that nothing else here would record.
        if (node.parent !== undefined) markDirty(node.parent);
        break;
      }
      case OP_COMMIT: {
        const rootTag = ops[at + 1];
        const surface = nodeAt(ops[at + 2], at);
        const childSet = slot.createChildSet(rootTag);
        const renderable: IFabricNode[] = [];
        // The surface NODE is contributed, not its children — it is the AppContainer view and it
        // commits. Routing it through the same call is what keeps the two shapes one path: an
        // ANCHOR in this position hoists its children exactly as before.
        //
        // `undefined` as the Fabric parent: the root CHILD SET is not a node. So a top-level node
        // moving between two surfaces is NOT caught by the parent comparison — `undefined ===
        // undefined` — and the rootTag is what separates them, which is why `materialize` compares
        // that too.
        appendRenderable(slot, renderable, surface, false, rootTag, undefined);
        // SKIPPED when the root child set comes back identical. `materialize` already declines to
        // clone a node nothing changed, so an unchanged tree produces the same handles — and
        // `completeRoot` on them is a full `ShadowTree::commit`, with layout and a mount pass, for
        // no change at all. `descriptor-outlet.test.ts` pins it: one completeRoot on a re-render of
        // structurally identical content.
        //
        // This is the half that makes `commitSurfaceOps`'s fan-out free. Every commit now names
        // every live root, because a cross-surface mutation dirties a surface whose renderer nobody
        // is holding; an untouched root reaches here with an identical list and stops.
        //
        // An earlier note here claimed the skip broke `create-tunnel.test.ts` because the tunnel's
        // cross-surface removal never reached the committed tree. It reached it. Probing every
        // commit's rootTag and every live surface's dirty pair, 2026-09-08:
        //
        //   enter root=920  s920{kids=1,d=00}  s921{kids=1,d=01}   <- B is dirty, A is not
        //   SKIP  root=920                                          <- and only A was asked to commit
        //
        // So the defect was the missing commit for B, and the skip only made it visible. Two things
        // were hiding it: that, and `installFabric()`'s recorder keeping ONE child set, so with two
        // surfaces mounted `fabric.committed` reports whichever committed LAST — the tunnel test's
        // "gone from surface B" was being answered by surface A's tree.
        if (
          surface.committed !== undefined &&
          surface.committedGeneration === recorderGeneration &&
          sameNodes(surface.committedRenderable, renderable)
        ) {
          break;
        }
        surface.committedRenderable = renderable;
        surface.committedGeneration = recorderGeneration;
        for (const child of renderable) slot.appendChildToSet(childSet, child);
        slot.completeRoot(rootTag, childSet);
        break;
      }
      default:
        throw new Error(`symbiote engine: unknown opcode ${ops[at]}`);
    }
  }
}

// ── THE PER-NODE READS JS STILL MAKES ────────────────────────────────────────────────────────────
//
// None is structural. The two prop reads exist because the host behaviors (press, text-input,
// switch) run in JS and must see the props they react to; the committed record is what the
// imperative APIs aim at. Their native twins are `Tree::getProp` / `getViewName` /
// `committedRecordOf`.

export function propOfNode(handle: object, key: string): unknown {
  return nodes.get(handle)?.props[key];
}

/**
 * What a node currently IS in Fabric, or `undefined` before its first commit.
 *
 * The whole surface the imperative APIs need — `measure`, `dispatchViewCommand`, the Animated
 * driver's tag. It replaces the old `committedOf(node)` reading an `IMirror`, and the shape is
 * deliberately the same three fields: everything downstream was already written against them.
 *
 * `undefined` is the ordinary state, not an error: an adapter that wires an imperative call at
 * lifecycle time runs before `completeRoot` under an async-batched commit, so every caller here
 * either defers (`whenCommitted`) or logs and returns.
 */
export function committedRecordOf(
  handle: object,
): { handle: IFabricNode; tag: number; rootTag: number } | undefined {
  const node = nodes.get(handle);
  if (node === undefined || node.committed === undefined) return undefined;
  return {
    handle: node.committed,
    tag: node.tag,
    rootTag: node.committedRootTag,
  };
}

export function viewNameOfNode(handle: object): string | undefined {
  const node = nodes.get(handle);
  if (node === undefined) return undefined;
  return node.committedViewName === '' ? node.viewName : node.committedViewName;
}

// ── THE STRUCTURAL READS ─────────────────────────────────────────────────────────────────────────
//
// Four framework seams navigate the host on their hot paths, and it is their contract, not our
// choice: Solid's nodeOps declare getParentNode / getFirstChild / getNextSibling, Vue's
// RendererOptions declare parentNode / nextSibling, Angular's Renderer2 the same pair, and Svelte's
// compiled output reaches firstChild / nextSibling as real prototype getters. Fabric answers none of
// them — `nativeFabricUIManager` exposes no structural read, and RN's `NativeDOM` answers against the
// CURRENT REVISION, which is never the tree a reconciler is mid-way through building.

function parentHandleOf(handle: object): object | undefined {
  return nodes.get(handle)?.parent?.handle;
}

function childHandlesOf(handle: object): readonly object[] {
  const node = nodes.get(handle);
  if (node === undefined) return [];
  return node.children.map(child => child.handle);
}

/** Whether the child-set build drops this node instead of committing it. */
function isSkipped(node: ITreeNode): boolean {
  return node.kind === KIND_ANCHOR || isEmptyRawText(node);
}

function censusOf(roots: readonly object[]): ITreeCensus {
  const census: ITreeCensus = {
    nodes: 0,
    anchors: 0,
    emptyRawTexts: 0,
    renderable: 0,
    flattenWidths: [],
  };
  // Explicit stack, not recursion: a deep list under a benchmark screen would blow the JS stack on
  // the very tree this is meant to measure.
  const stack: ITreeNode[] = [];
  for (const root of roots) {
    const node = nodes.get(root);
    if (node !== undefined) stack.push(node);
  }
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    census.nodes += 1;
    if (node.kind === KIND_ANCHOR) census.anchors += 1;
    else if (isEmptyRawText(node)) census.emptyRawTexts += 1;
    else census.renderable += 1;
    if (node.children.some(isSkipped))
      census.flattenWidths.push(node.children.length);
    for (const child of node.children) stack.push(child);
  }
  census.flattenWidths.sort((left, right) => right - left);
  return census;
}

/**
 * This module, as the engine's `ITreeHost` — what `installFabric()` installs through `setTreeHost`.
 *
 * The slot is resolved per call rather than captured: a fixture routinely installs a fake and then
 * calls `resetSlot()`, and a captured facade would answer about the previous one.
 */
// ── THE IMPERATIVE FIVE ──────────────────────────────────────────────────────────────────────────
//
// Native answers these off the `ShadowNode` its last commit left on the node; here the equivalent is
// the fake Fabric node, and the slot's own methods do the work. So this half is a lookup and a
// forward — the mapping, not the behaviour, is what each host owns.
//
// A node with no committed handle is the ORDINARY state under an async-batched commit, not an error,
// and it degrades the way native's does: nothing happens, except `measureLayout`, which owes its
// caller the `onFail` Fabric's own contract promises.
function committedOf(handle: object): IFabricNode | undefined {
  return nodes.get(handle)?.committed;
}

export const treeApplierHost: ITreeHost = {
  applyOps: batch => applyBatch(batch, getSlot()),
  propOf: propOfNode,
  committedRecordOf,
  parentOf: parentHandleOf,
  childrenOf: childHandlesOf,
  census: censusOf,

  dispatchCommand: (handle, commandName, args) => {
    const committed = committedOf(handle);
    if (committed !== undefined) {
      getSlot().dispatchCommand(committed, commandName, args);
    }
  },
  sendAccessibilityEvent: (handle, eventType) => {
    const committed = committedOf(handle);
    if (committed !== undefined) {
      getSlot().sendAccessibilityEvent(committed, eventType);
    }
  },
  measure: (handle, callback) => {
    const committed = committedOf(handle);
    if (committed !== undefined) getSlot().measure(committed, callback);
  },
  measureInWindow: (handle, callback) => {
    const committed = committedOf(handle);
    if (committed !== undefined) getSlot().measureInWindow(committed, callback);
  },
  measureLayout: (handle, relativeTo, onFail, onSuccess) => {
    const committed = committedOf(handle);
    const relative = committedOf(relativeTo);
    if (committed === undefined || relative === undefined) {
      onFail();
      return;
    }
    getSlot().measureLayout(committed, relative, onFail, onSuccess);
  },
};
