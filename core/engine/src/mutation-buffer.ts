// The contract: native owns the tree, JS emits nothing but a command buffer. This file is the
// spec — core/engine/cpp/SymbioteTree.cpp must agree with it, since a wire format described in
// prose gets reimplemented, written as code gets exercised.

// ── what changed, and why it is smaller than it sounds ───────────────────────────────────────────

// The adapter used to mutate a JS tree that commit.ts walked to re-derive a diff the framework
// already knew. The buffer now carries the adapter's alphabet directly: the walk, the diffing,
// and the JS shadow tree (IMirror) all disappear rather than move.

// ── the alphabet ─────────────────────────────────────────────────────────────────────────────────

// Nine operations — the mutation API node.ts already exports, minus what was never primitive:
// setNodeHidden/setNodePressed resolve a CSS class to a style in JS then call setProp; a listener
// can't be folly::dynamic, so setEventListener crosses only its boolean gate flag as a setProp.

// ── what stays in JS, and it is not a tree ──────────────────────────────────────────────────────

// The handle per node: a bare {} carrying native's node on NativeState — no parent/children/order,
// just an address. Listeners and the CSS class registry stay flat maps; host behaviors read props
// back over JSI at gesture rate, not commit rate.

// ── why props go native, decided the other way first ────────────────────────────────────────────

// Keeping prop values in JS assumed RawProps is lazy so handing Fabric a JS object costs nothing —
// wrong: ConcreteComponentDescriptor::cloneProps calls parse() unconditionally, and the preparse
// walks every key of every node through JSI regardless of mode.

// So a create already pays a JSI property read and a string allocation per prop, per node, inside
// createNode. Props held natively as folly::dynamic, built incrementally as setProp ops arrive,
// are cheaper than what shipped before, not more expensive.

// The opcodes. These numbers ARE the contract: renumbering here without renumbering the C++ side
// commits a different tree, silently, and no test in either language can see across the boundary.

// Stride is fixed so the ops array is addressable as memory rather than parsed. Operands are
// either a slot (an index into the batch's handles array) or an index into a side table.
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
// The intrinsic tag this node came from — pressable, not RCTView. [slot, tag]. Emitted only for a
// node a host behavior actually attached to; every other node pays nothing.

// Native's platform-prop rules key off what the node IS, and the Fabric view name alone doesn't
// always answer that — pressable commits as RCTView, byte-identical to a plain view, so the tag
// is the only fact that separates them.
export const OP_SET_TAG = 10; // [slot, tag]

// An app callback appeared on, or disappeared from, an event name the behavior owns.
// [slot, name, present]. See recordSetOwnedListener for why the bit crosses, not the closure.
export const OP_SET_OWNED_LISTENER = 11; // [slot, name, present]

// A behavior's feedback state flipped — TouchableHighlight's underlay is showing, or stopped.
// [slot, shown]. The second bit to cross for the same reason the first did: OP_SET_OWNED_LISTENER
// carries whether the app wired a handler, this carries whether the control is giving feedback.

// The timer stays in JS, and that's the boundary, not an omission: WHEN the bit flips is
// Pressability plus a delayPressOut hold at gesture rate; WHAT a showing underlay looks like is
// the platform's (foldTouchableHighlightUnderlay).

// A flip is a gesture-rate event rather than a per-render one — twice a tap, against a payloadFold
// that used to be charged on every commit the node was dirty in for the life of the screen.
export const OP_SET_UNDERLAY_SHOWN = 12; // [slot, shown]

// A void node: commits nothing of its own and does not hoist its children into Fabric either —
// unlike an anchor, which hoists. [slot]. InputAccessoryView.js renders null on Android, so the
// whole component (children included) must vanish, which an anchor can't express.

// Everything else about it (the retained JS tree, appendChild, adapter bookkeeping) is unaffected;
// only the commit walk treats it as contributing zero Fabric nodes, recursively.
export const OP_CREATE_VOID = 13; // [slot]

// A setProp whose value slot is this deletes the key. undefined can't carry it: null is a
// legitimate Fabric prop value meaning "reset to default", and the two must stay distinguishable
// since cloneNodeWithNewProps merges — a removed key must be sent as explicit null, never omitted.
export const NO_VALUE = -1;

// A node kind. Native needs it because two of the three never become a Fabric node the same way,
// decided at insert or child-set build, never by a walk. ELEMENT is an ordinary view, except a
// text inside another text commits as RCTVirtualText, resolved when it acquires a parent.

// RAW_TEXT is an RCTRawText leaf, skipped from its parent's child set when empty. ANCHOR never
// becomes a Fabric node: native hoists its children into its parent's child set instead, which is
// why our own store cannot BE the Fabric tree.

// A surface is an anchor too: its children belong to the root's child set the same way an
// anchor's belong to its parent's list, so OP_COMMIT names one and native needs no rootTag -> node
// map — keeping the applier stateless.
export const KIND_ELEMENT = 0;
export const KIND_RAW_TEXT = 1;
export const KIND_ANCHOR = 2;

// One recorded batch, flat. handles is the load-bearing table and travels out rather than back:
// it holds the placeholder object for every slot the ops address, and native attaches each created
// node to that slot's object as JSI NativeState — the adapter's own objects become the handles.

// A slot is an index into THIS batch and meaningless outside it, deliberately: an id that outlives
// a batch forces a table on the far side, and a table is a second owner with no signal when the
// first one lets go — exactly the leak class a prior applier design hit.

// values carries whatever a prop is: a string, number, boolean, null, style object, array. Native
// converts each to folly::dynamic once, when the op is applied — never again per commit.

// What the buffer needs a handle to be. Still an identity and nothing else as far as the ops are
// concerned — no parent, no children, no order. The two fields are the buffer's own scratch space
// for slotOf, written here and read by nobody else.

// Spelled as a requirement rather than optional fields on purpose: a handle that cannot hold its
// slot would fall back to nothing, and the failure would be a silently re-pushed node rather than
// a type error.
export type IMutationHandle = {
  slot: number;
  slotBatch: number;
};

export type IMutationBatch = {
  readonly ops: Int32Array;
  readonly strings: readonly string[];
  readonly values: readonly unknown[];
  readonly instanceHandles: readonly unknown[];
  readonly handles: readonly object[];
};

// What native answers back, for the four things JS still asks. All four are per-node and none is
// structural — no parent, no children, no order. A host behavior runs in JS and needs to see the
// props it reacts to; an app can measure a ref.

// Called at gesture rate, not commit rate, which is what makes the crossing cost irrelevant.
export type INativeTree = {
  applyOps: (batch: IMutationBatch) => void;
  getProp: (handle: IMutationHandle, key: string) => unknown;
  // The resolved Fabric view name, which native may have changed at insert (see KIND_ELEMENT).
  getViewName: (handle: IMutationHandle) => string;
};

// ── the recorder ─────────────────────────────────────────────────────────────────────────────────

// One buffer per process, drained by takeBatch() at commit. Not per surface: a node belongs to
// exactly one surface, so ops for another surface are inert until that surface commits.

// Typed from the start, not a number[] converted at drain time — a plain array walks every element
// through the iterator protocol on every commit, and Int32Array.from takes the same path. The
// escape is not building an Array at all.

// Capacity doubles and is never given back: a commit that once needed this many slots will need
// them again, and re-growing from a small start would pay the same copies every commit.
const INITIAL_OP_CAPACITY = 1_024;
let ops = new Int32Array(INITIAL_OP_CAPACITY);
let opCount = 0;
let strings: string[] = [];
let values: unknown[] = [];
let instanceHandles: unknown[] = [];
let handles: object[] = [];

// Interning matters more here than it looks: a 1 000-row create emits about a dozen distinct view
// names across 10 000 elements, and every prop KEY is drawn from a set of a few hundred.
const stringIds = new Map<string, number>();

// Which batch the slot standing on a handle belongs to. Bumped by takeBatch, which invalidates
// every slot at once without walking the handles that hold them.

// Starts at 1 because a fresh node's slotBatch is 0, so an untouched handle can never match a live
// batch and needs no separate "is it in this batch" flag.
let batchId = 1;
// The same table for prop values, and it pays off on the far side: the host converts each entry
// to folly::dynamic when the op is applied, so a style object reused across many rows was many
// conversions of the same object without it.
const valueIds = new Map<unknown, number>();

// Booleans skip that table entirely — see `internValue`. Two slots, reset with the batch alongside
// everything else the tables hold.
const NOT_INTERNED = -1;
let trueId = NOT_INTERNED;
let falseId = NOT_INTERNED;

function intern(text: string): number {
  const existing = stringIds.get(text);
  if (existing !== undefined) return existing;
  strings.push(text);
  stringIds.set(text, strings.length - 1);
  return strings.length - 1;
}

// The index the ops address this value by — deduplicated when it is worth deduplicating. Objects,
// functions and strings go through the Map: they repeat (one StyleSheet.create object per screen)
// and their conversion costs something.

// Booleans are folded without the Map, since there are only two of them — a dedicated slot each is
// a branch rather than a hash. The conversion was never the whole cost either: values is a JSI
// array the host reads entry by entry, so a duplicate is a crossing whatever it holds.

// Numbers stay out: they'd need the Map, whose keys compare by SameValueZero (folding -0 into 0,
// NaN into itself), and a value this cheap to convert isn't worth opening that question for.

// Identity, never structural equality — comparing deeply would make the buffer's cost depend on
// the size of what it's handed. Reusing an index is safe against mutation between two ops since
// the host converts at apply time, after the batch closes, when both already reflect final state.
function internValue(value: unknown): number {
  if (value === true) {
    if (trueId === NOT_INTERNED) trueId = pushValue(value);
    return trueId;
  }
  if (value === false) {
    if (falseId === NOT_INTERNED) falseId = pushValue(value);
    return falseId;
  }

  const kind = typeof value;
  const isWorthInterning =
    kind === 'string' ||
    kind === 'function' ||
    (kind === 'object' && value !== null);
  if (!isWorthInterning) return pushValue(value);

  const existing = valueIds.get(value);
  if (existing !== undefined) return existing;
  const id = pushValue(value);
  valueIds.set(value, id);
  return id;
}

function pushValue(value: unknown): number {
  values.push(value);
  return values.length - 1;
}

// The index the ops address this handle by, for the duration of THIS batch. Assigned on first
// mention rather than at creation, so a batch carries exactly the nodes it names — a handle from
// an earlier batch arrives already owning its native node.

// The slot lives on the handle, not in a Map keyed by it, a measured decision: this runs once per
// handle operand, and a Map<object, number> charges a hash per lookup plus a set on a miss. Two
// fields on a shape the node already carries turn that into a compare.

// An epoch rather than clearing: a slot is meaningless outside its batch, so every slot must die
// on drain. Walking handles to reset them costs what Map.clear costs; bumping one counter
// invalidates all of them at once, and an unmentioned handle is never touched.
function slotOf(handle: IMutationHandle): number {
  // A buffer cannot silently absorb a handle that isn't a node the way the old retained tree did
  // (children.indexOf(x) === -1, no-op) — the op is recorded, and the failure surfaces in the
  // host, on a later op, as a node whose create it never saw.

  // Deliberately only "an object", not "one of our nodes": a handle is an identity to this file and
  // nothing more. The wrong-kind-of-object case is caught one layer on, where the host fails to
  // resolve it and can name the opcode.
  if (typeof handle !== 'object' || handle === null) {
    throw new Error(
      `symbiote engine: a mutation named ${String(handle)}, which is not a node. An adapter is ` +
        `passing a framework sentinel straight through — an absent insert anchor is spelled by ` +
        `calling appendChild.`,
    );
  }
  if (handle.slotBatch === batchId) return handle.slot;
  handles.push(handle);
  handle.slot = handles.length - 1;
  handle.slotBatch = batchId;
  return handle.slot;
}

// Has anything changed the tree since the last commit drained? Not the same question as
// hasPendingOps(): every structural read calls flushOps, which empties the buffer many times
// between commits, so hasPendingOps() alone would answer "no" for unpublished work.

// OP_COMMIT is excluded deliberately: recording a commit is not a change to the tree, and counting
// it would make every commit look like it had work.
let changedSinceCommit = false;

function push(op: number, a = 0, b = 0, c = 0, d = 0, e = 0): void {
  if (op !== OP_COMMIT) changedSinceCommit = true;
  if (opCount + OP_STRIDE > ops.length) {
    const grown = new Int32Array(ops.length * 2);
    grown.set(ops);
    ops = grown;
  }
  ops[opCount] = op;
  ops[opCount + 1] = a;
  ops[opCount + 2] = b;
  ops[opCount + 3] = c;
  ops[opCount + 4] = d;
  ops[opCount + 5] = e;
  opCount += OP_STRIDE;
}

// Whether a commit would publish anything. See changedSinceCommit.
export function hasChangedSinceCommit(): boolean {
  return changedSinceCommit;
}

// Called by commitSurfaceOps once it has drained. Separate from takeBatch because a read drains
// too, and a read is not a commit — clearing there would make the next commit believe its work had
// already been published.
export function noteCommitDrained(): void {
  changedSinceCommit = false;
}

// The one dirtying route that writes no op: a behavior with a derived payload asks the host to
// rebuild a node the buffer never named. Without this the commit that follows would look idle and
// be skipped, and the derived payload would sit unpublished until something unrelated changed.
export function noteHostSideChange(): void {
  changedSinceCommit = true;
}

// Nodes whose placement this batch has not published yet — created, or named as the child of a
// structural op. Exists so a read doesn't have to drain: parentOf is unconditional otherwise, and
// most reads never touch a node the pending batch has.

// Sound because a node's parent link changes only through an op that names that node as the child
// — `before` on an insert is a position reference and moves nothing, so a handle absent from here
// has the same parent in the host as it has here.

// Creation is in it too, since the host can't answer about a node it's never been told exists — the
// half a "was it re-parented" set alone would get wrong.

// Not a tree: it answers about the buffer, whether this node's placement is unpublished. Emptied
// by takeBatch, so it never outlives one batch and can never disagree with the host.
let placementPending = new Set<object>();

/** Does the pending batch hold anything that could change what the host says this node's parent is? */
export function hasPendingPlacement(handle: IMutationHandle): boolean {
  return placementPending.has(handle);
}

export function recordCreateElement(
  handle: IMutationHandle,
  viewName: string,
  isText: boolean,
  instanceHandle: unknown,
): void {
  instanceHandles.push(instanceHandle);
  placementPending.add(handle);
  push(
    OP_CREATE_ELEMENT,
    slotOf(handle),
    intern(viewName),
    isText ? 1 : 0,
    instanceHandles.length - 1,
  );
}

export function recordCreateRawText(
  handle: IMutationHandle,
  text: string,
): void {
  placementPending.add(handle);
  push(OP_CREATE_RAW_TEXT, slotOf(handle), intern(text));
}

export function recordCreateAnchor(handle: IMutationHandle): void {
  placementPending.add(handle);
  push(OP_CREATE_ANCHOR, slotOf(handle));
}

export function recordCreateVoid(handle: IMutationHandle): void {
  placementPending.add(handle);
  push(OP_CREATE_VOID, slotOf(handle));
}

export function recordAppendChild(
  parent: IMutationHandle,
  child: IMutationHandle,
): void {
  placementPending.add(child);
  push(OP_APPEND_CHILD, slotOf(parent), slotOf(child));
}

export function recordInsertBefore(
  parent: IMutationHandle,
  child: IMutationHandle,
  before: IMutationHandle,
): void {
  placementPending.add(child);
  push(OP_INSERT_BEFORE, slotOf(parent), slotOf(child), slotOf(before));
}

export function recordRemoveChild(
  parent: IMutationHandle,
  child: IMutationHandle,
): void {
  placementPending.add(child);
  push(OP_REMOVE_CHILD, slotOf(parent), slotOf(child));
}

/** `undefined` DELETES the key — the collapse `setProp` has always performed, spelled on the wire. */
export function recordSetProp(
  handle: IMutationHandle,
  key: string,
  value: unknown,
): void {
  if (value === undefined) {
    push(OP_SET_PROP, slotOf(handle), intern(key), NO_VALUE);
    return;
  }
  push(OP_SET_PROP, slotOf(handle), intern(key), internValue(value));
}

export function recordSetText(handle: IMutationHandle, text: string): void {
  push(OP_SET_TEXT, slotOf(handle), intern(text));
}

// Change a node's Fabric view name after creation. Exists for one thing: TextInput's multiline
// decides between RCTSinglelineTextInputView and RCTMultilineTextInputView, and an app can flip it.

// No prop write moves a node between native views, so the host re-creates it under the new name
// and re-parents its children. A JS-only workaround would need JS to hold the tree — the one thing
// this design rules out.
export function recordSetComponent(
  handle: IMutationHandle,
  viewName: string,
): void {
  push(OP_SET_COMPONENT, slotOf(handle), intern(viewName));
}

export function recordSetTag(handle: IMutationHandle, tag: string): void {
  push(OP_SET_TAG, slotOf(handle), intern(tag));
}

// Whether an app callback is currently wired to an event name the behavior owns. [slot, name,
// present]. The existence, never the function — a name a behavior owns is diverted into a JS
// stash and never becomes a prop, so native needs this bit to compute focusable itself.

// The browser is the precedent: a UA computes focusability itself because addEventListener is its
// own API, so it knows which elements carry a handler while the handler's body stays the app's.

// Emitted on a flip only, from setEventListener, which already ignores listener identity since a
// framework hands a fresh closure nearly every render — a mount-time op, not a per-render one.
export function recordSetOwnedListener(
  handle: IMutationHandle,
  name: string,
  isPresent: boolean,
): void {
  push(OP_SET_OWNED_LISTENER, slotOf(handle), intern(name), isPresent ? 1 : 0);
}

/** See `OP_SET_UNDERLAY_SHOWN`. Emitted on a flip only, from the behavior that owns the timer. */
export function recordSetUnderlayShown(
  handle: IMutationHandle,
  shown: boolean,
): void {
  push(OP_SET_UNDERLAY_SHOWN, slotOf(handle), shown ? 1 : 0);
}

export function recordCommit(rootTag: number, surface: IMutationHandle): void {
  push(OP_COMMIT, rootTag, slotOf(surface));
}

/** Whether anything is pending. The commit path asks before paying for a drain. */
export function hasPendingOps(): boolean {
  return opCount > 0;
}

// Drain the buffer. Fresh arrays rather than reused ones: the batch outlives this call on the
// native path (applyOps reads handles while attaching state), and a recycled array would be
// mutated under it by the next mutation the adapter makes.

// slice for the ops, not subarray, for the same reason — subarray would share the backing store
// the very next push writes into. The ops buffer itself is kept so its capacity survives the drain.
export function takeBatch(): IMutationBatch {
  const batch: IMutationBatch = {
    ops: ops.slice(0, opCount),
    strings,
    values,
    instanceHandles,
    handles,
  };
  opCount = 0;
  strings = [];
  values = [];
  instanceHandles = [];
  handles = [];
  // A fresh Set rather than `.clear()`: the old one is handed to nobody, and clearing a set that
  // held ten thousand handles on a benchmark create costs more than dropping it.
  placementPending = new Set();
  stringIds.clear();
  // Every slot standing on a handle dies here, without touching one of them — see `slotOf`.
  batchId += 1;
  valueIds.clear();
  trueId = NOT_INTERNED;
  falseId = NOT_INTERNED;
  return batch;
}

/** Test seam. Drops everything pending without applying it. */
export function resetMutationBuffer(): void {
  takeBatch();
}
