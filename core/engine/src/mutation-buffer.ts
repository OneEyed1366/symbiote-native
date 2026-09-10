// THE CONTRACT. Native owns the tree; JS emits nothing but a command buffer.
//
// This file is the spec and `core/engine/cpp/SymbioteTree.cpp` must agree with it, for the reason a
// wire format is written as code at all: described in prose it gets reimplemented, written as code
// it gets exercised.
//
// ── WHAT CHANGED, AND WHY IT IS SMALLER THAN IT SOUNDS ───────────────────────────────────────────
//
// The adapter used to mutate a JS tree, `commit.ts` walked it to work out what changed, and the
// batch that crossed carried FABRIC operations — `createNode` / `cloneNode` / `appendChild`. The
// walk is
// 2 041 lines because it re-derives a diff.
//
// The framework already had that diff. A reconciler's entire job is knowing what changed, and every
// adapter hands us the answer call by call before we throw it away and recompute it. So the buffer
// carries the ADAPTER's alphabet instead, and the derivation disappears rather than moving:
//
//   the walk over dirty subtrees      gone — the framework names the nodes
//   desired-vs-committed diffing      gone — the framework names the operations
//   IMirror                           gone — it was a JS re-implementation of `ShadowNode`, which
//                                     already carries children and props (ShadowNode.h:133-134),
//                                     duplicated only because reading it from JS costs a crossing
//   the parent table, the edit log    gone — native holds parent and children itself
//   clone-on-write                    STAYS, in C++, along the paths the ops marked
//
// ── THE ALPHABET ─────────────────────────────────────────────────────────────────────────────────
//
// Nine operations. It is the mutation API `node.ts` already exports, minus the four that were never
// primitive:
//
//   setNodeHidden / setNodePressed    resolve a CSS class to a style IN JS and then call setProp.
//                                     The class registry stays in JS, so what crosses is the result.
//   setEventListener /                a listener is a closure and cannot be `folly::dynamic`. It
//     setBehaviorListener             stays in a JS registry; what crosses is the boolean gate flag
//                                     (`GATED_EVENT_PROPS`), which is an ordinary setProp.
//
// ── WHAT STAYS IN JS, AND IT IS NOT A TREE ───────────────────────────────────────────────────────
//
//   the handle per node     a bare `{}` carrying native's node on `NativeState`. No parent, no
//                           children, no order — an address. Its lifetime IS the node's lifetime,
//                           which is how `nativeFabricUIManager` and a browser both work.
//   listeners               Map<handle, Map<name, fn>>. Flat.
//   the CSS class registry  class -> style, resolved before any op is written. Native never sees a
//                           class name.
//   host behaviors          the press / text-input / switch machines. They read props back over
//                           JSI at GESTURE rate — ~10 reads per touch, not 19 009 per commit.
//
// ── WHY PROPS GO NATIVE, WHICH WAS DECIDED THE OTHER WAY FIRST ───────────────────────────────────
//
// The first draft of this contract kept prop VALUES in JS and gave native only the structure, on
// the reasoning that `RawProps` is lazy so handing Fabric a JS object costs nothing. That is wrong.
// `RawProps` is lazy only until `parse()`, and `ConcreteComponentDescriptor::cloneProps` calls it
// UNCONDITIONALLY. In `Mode::JSI` the preparse walks every key of every node —
// `getPropertyNames`, then per key `getValueAtIndex` + `getString` + `utf8()` (a `std::string`
// allocation) + `getProperty` — and `enableCppPropsIteratorSetter()` defaults to FALSE in 0.86, so
// that is the live path. `Mode::Dynamic` does the identical work with zero JSI.
//
// So a 1 000-row create already pays ~44 001 JSI property reads and as many string allocations
// INSIDE `createNode`. Props held natively as `folly::dynamic`, built incrementally as `setProp`
// ops arrive, are cheaper than what ships today, not more expensive.

/**
 * The opcodes. These numbers ARE the contract: renumbering here without renumbering the C++ commits
 * a different tree, silently, and no test in either language can see across the boundary.
 *
 * Stride is fixed so the ops array is addressable as memory rather than parsed. Operands are either
 * a SLOT (an index into the batch's `handles` array — see below) or an index into a side table.
 */
export const OP_STRIDE = 6;

export const OP_CREATE_ELEMENT = 0; // [slot, viewName, isText, tag, instanceHandle]
export const OP_CREATE_RAW_TEXT = 1; // [slot, text]
export const OP_CREATE_ANCHOR = 2; // [slot]
export const OP_APPEND_CHILD = 3; // [parent, child]
export const OP_INSERT_BEFORE = 4; // [parent, child, before]
export const OP_REMOVE_CHILD = 5; // [parent, child]
export const OP_SET_PROP = 6; // [slot, key, value] — value = NO_VALUE deletes the key
export const OP_SET_TEXT = 7; // [slot, text]
export const OP_COMMIT = 8; // [rootTag, surface]
export const OP_SET_COMPONENT = 9; // [slot, viewName]

/**
 * A `setProp` whose value slot is this DELETES the key.
 *
 * `undefined` cannot carry it: `null` is a legitimate Fabric prop value meaning "reset to the
 * default", and the two must stay distinguishable — `cloneNodeWithNewProps` merges, so a removed
 * key has to be sent as an explicit `null` while a key that was never there must not be sent at
 * all. The JS `setProp` already collapses `undefined` to a delete before anything is encoded.
 */
export const NO_VALUE = -1;

/**
 * A node kind. Native needs it because two of the three never become a Fabric node the same way,
 * and both rules are decided at INSERT or at child-set build — never by a walk:
 *
 *   ELEMENT   an ordinary view. Its Fabric view name is fixed at creation, with ONE exception:
 *             a text element inside another text element commits as `RCTVirtualText` instead of
 *             `RCTText`. Native resolves that when the node acquires a parent, because that is when
 *             it first knows the answer, and re-resolves it on a reparent.
 *   RAW_TEXT  an `RCTRawText` leaf. Skipped from its parent's child set when its text is empty —
 *             an empty one would paint.
 *   ANCHOR    a position marker the frameworks insert (`{#if}`, a fragment, a `{@render}` slot).
 *             It never becomes a Fabric node at all: native keeps it in ITS OWN structure so
 *             `insertBefore(parent, node, anchor)` resolves, and hoists its children into its
 *             parent's child list when building the child set. This is why our own store cannot BE
 *             the Fabric tree — there is no Fabric node to hold an anchor, which is the one thing
 *             `IMirror` was genuinely for.
 *
 * A SURFACE is an anchor too, and that is not a trick: an anchor is a node whose children belong to
 * its parent's list, and a surface is a node whose children belong to the root's child set. Same
 * shape, so `OP_COMMIT` names one and the native side needs no `rootTag -> node` map — which keeps
 * the applier stateless, the property the whole lifetime design rests on.
 */
export const KIND_ELEMENT = 0;
export const KIND_RAW_TEXT = 1;
export const KIND_ANCHOR = 2;

/**
 * One recorded batch, flat.
 *
 * `handles` is the load-bearing table and it travels OUT rather than back: it holds the placeholder
 * object for every slot the ops address, and native attaches each created node to the object at
 * that slot as JSI `NativeState`. So the objects the adapter is already holding become the handles
 * in place, their lifetime is the nodes' lifetime, and nothing has to be freed explicitly.
 *
 * A slot is an index into THIS batch and is meaningless outside it. That is deliberate: an id that
 * outlives a batch forces a table on the far side, and a table is a second owner with nothing to
 * tell it when the first one let go — which is exactly the leak that took the previous applier from
 * 792 to 1492 MB.
 *
 * `values` carries whatever a prop is: a string, a number, a boolean, `null`, a style object, an
 * array. Native converts each to `folly::dynamic` ONCE, when the op is applied — never again per
 * commit, which is the half that ships today.
 */
export type IMutationBatch = {
  readonly ops: Int32Array;
  readonly strings: readonly string[];
  readonly values: readonly unknown[];
  readonly instanceHandles: readonly unknown[];
  readonly handles: readonly object[];
};

/**
 * What native answers back, for the four things JS still asks.
 *
 * All four are per-node and none of them is structural — no parent, no children, no order. They
 * exist because a host behavior runs in JS and has to see the props it reacts to, and because an
 * app can measure a ref.
 *
 * Called at GESTURE rate, not commit rate, which is what makes the crossing cost irrelevant: ~10
 * reads per touch against the 19 009 per commit this whole design exists to remove.
 */
export type INativeTree = {
  applyOps: (batch: IMutationBatch) => void;
  getProp: (handle: object, key: string) => unknown;
  /** The resolved Fabric view name, which native may have changed at insert (see `KIND_ELEMENT`). */
  getViewName: (handle: object) => string;
};

// ── THE RECORDER ─────────────────────────────────────────────────────────────────────────────────
//
// One buffer per process, drained by `takeBatch()` at commit. Not per surface: a node belongs to
// exactly one surface, so ops for another surface are inert until that surface commits — the same
// argument `edit-buffer.ts` made for not threading a surface through every mutation site, and the
// same conclusion.

let ops: number[] = [];
let strings: string[] = [];
let values: unknown[] = [];
let instanceHandles: unknown[] = [];
let handles: object[] = [];

// Interning matters more here than it looks: a 1 000-row create emits about a dozen distinct view
// names across 10 000 elements, and every prop KEY is drawn from a set of a few hundred.
const stringIds = new Map<string, number>();
const slots = new Map<object, number>();

function intern(text: string): number {
  const existing = stringIds.get(text);
  if (existing !== undefined) return existing;
  strings.push(text);
  stringIds.set(text, strings.length - 1);
  return strings.length - 1;
}

/**
 * The index the ops address this handle by, for the duration of THIS batch.
 *
 * Assigned on first mention rather than at creation, so a batch carries exactly the nodes it names.
 * A handle created by an earlier batch arrives already owning its native node, which is what lets a
 * clone source three commits old resolve with no bookkeeping on either side.
 */
function slotOf(handle: object): number {
  // The retained tree used to ABSORB a handle that was not a node: `children.indexOf(x)` returned
  // -1 and the mutation was a silent no-op. A buffer cannot — the op is recorded, and the failure
  // surfaces in the HOST, on a later op, in another batch, as a node whose create it appears never
  // to have seen. Both of the real cases found this way were framework spellings the old tree had
  // been swallowing for months: solid-js passing `null` as "insert at the end", and Angular asking
  // to remove the SURFACE at teardown.
  //
  // Deliberately only "an object", not "one of OUR nodes": a handle is an identity to this file and
  // nothing more, and the applier's own fixtures address bare `{}`. The wrong-KIND-of-object case
  // (Angular handing over a `SymbioteSurface` at teardown) is caught one layer on, where the host
  // fails to resolve it and can name the opcode.
  if (typeof handle !== 'object' || handle === null) {
    throw new Error(
      `symbiote engine: a mutation named ${String(handle)}, which is not a node. An adapter is ` +
        `passing a framework sentinel straight through — an absent insert anchor is spelled by ` +
        `calling appendChild.`,
    );
  }
  const existing = slots.get(handle);
  if (existing !== undefined) return existing;
  handles.push(handle);
  slots.set(handle, handles.length - 1);
  return handles.length - 1;
}

function push(op: number, a = 0, b = 0, c = 0, d = 0, e = 0): void {
  ops.push(op, a, b, c, d, e);
}

export function recordCreateElement(
  handle: object,
  viewName: string,
  isText: boolean,
  instanceHandle: unknown,
): void {
  instanceHandles.push(instanceHandle);
  push(
    OP_CREATE_ELEMENT,
    slotOf(handle),
    intern(viewName),
    isText ? 1 : 0,
    instanceHandles.length - 1,
  );
}

export function recordCreateRawText(handle: object, text: string): void {
  push(OP_CREATE_RAW_TEXT, slotOf(handle), intern(text));
}

export function recordCreateAnchor(handle: object): void {
  push(OP_CREATE_ANCHOR, slotOf(handle));
}

export function recordAppendChild(parent: object, child: object): void {
  push(OP_APPEND_CHILD, slotOf(parent), slotOf(child));
}

export function recordInsertBefore(
  parent: object,
  child: object,
  before: object,
): void {
  push(OP_INSERT_BEFORE, slotOf(parent), slotOf(child), slotOf(before));
}

export function recordRemoveChild(parent: object, child: object): void {
  push(OP_REMOVE_CHILD, slotOf(parent), slotOf(child));
}

/** `undefined` DELETES the key — the collapse `setProp` has always performed, spelled on the wire. */
export function recordSetProp(
  handle: object,
  key: string,
  value: unknown,
): void {
  if (value === undefined) {
    push(OP_SET_PROP, slotOf(handle), intern(key), NO_VALUE);
    return;
  }
  values.push(value);
  push(OP_SET_PROP, slotOf(handle), intern(key), values.length - 1);
}

export function recordSetText(handle: object, text: string): void {
  push(OP_SET_TEXT, slotOf(handle), intern(text));
}

/**
 * Change a node's Fabric view name after creation.
 *
 * It exists for exactly one thing and would not otherwise: `TextInput`'s `multiline` decides between
 * `RCTSinglelineTextInputView` and `RCTMultilineTextInputView`, and an app can flip it. No prop write
 * moves a node between native views, so the host has to RE-CREATE the node under the new name and
 * re-parent its children — which is the same path a reparent already takes, and why this needs no
 * new machinery on the far side beyond honouring the name.
 *
 * A JS-only workaround was the alternative and it is the one thing this design rules out: to know
 * what to rebuild, JS would have to hold the tree.
 */
export function recordSetComponent(handle: object, viewName: string): void {
  push(OP_SET_COMPONENT, slotOf(handle), intern(viewName));
}

export function recordCommit(rootTag: number, surface: object): void {
  push(OP_COMMIT, rootTag, slotOf(surface));
}

/** Whether anything is pending. The commit path asks before paying for a drain. */
export function hasPendingOps(): boolean {
  return ops.length > 0;
}

/**
 * Drain the buffer.
 *
 * Fresh arrays rather than reused ones: the batch outlives this call on the native path (`applyOps`
 * reads `handles` while attaching state), and a recycled array would be mutated under it by the next
 * mutation the adapter makes.
 */
export function takeBatch(): IMutationBatch {
  const batch: IMutationBatch = {
    ops: Int32Array.from(ops),
    strings,
    values,
    instanceHandles,
    handles,
  };
  ops = [];
  strings = [];
  values = [];
  instanceHandles = [];
  handles = [];
  stringIds.clear();
  slots.clear();
  return batch;
}

/** Test seam. Drops everything pending without applying it. */
export function resetMutationBuffer(): void {
  takeBatch();
}
