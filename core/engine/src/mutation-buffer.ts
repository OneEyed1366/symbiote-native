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
 * The INTRINSIC TAG this node came from — `pressable`, not `RCTView`. `[slot, tag]`.
 *
 * Emitted only for a node a host behavior actually attached to, from `attachHostBehavior`, which is
 * where the tag is already in hand and already matched. Every other node pays nothing.
 *
 * WHY THE TAG HAS TO CROSS AT ALL. A tag's platform props are resolved natively now, and the native
 * side keys them off what it knows the node IS. For `<text-input>` the Fabric view name answers
 * that by itself (`RCTSinglelineTextInputView` names nothing else); for `<pressable>` it does not —
 * it commits as `RCTView`, byte-identical to a plain view. The tag is the only fact that separates
 * them, and it is the same fact a browser keys user-agent behavior off.
 */
export const OP_SET_TAG = 10; // [slot, tag]

/**
 * An app callback appeared on, or disappeared from, an event name the behavior OWNS.
 * `[slot, name, present]`. See `recordSetOwnedListener` for why the bit crosses and the closure
 * does not.
 */
export const OP_SET_OWNED_LISTENER = 11; // [slot, name, present]

/**
 * A behavior's FEEDBACK state flipped — TouchableHighlight's underlay is showing, or stopped.
 * `[slot, shown]`.
 *
 * The second bit to cross for the same reason the first did. `OP_SET_OWNED_LISTENER` carries whether
 * the app wired a handler; this carries whether the control is currently giving feedback, which is
 * the platform's own `:active` in everything but the timing. `setNodePressed`'s header already calls
 * the press state "the engine-owned half of what `:active` is on the web", and this is its twin for
 * the one control whose feedback does NOT track the press exactly: RN holds the underlay past
 * release so a fast tap still flashes (`TouchableHighlight.js:270-293`).
 *
 * THE TIMER STAYS IN JS and that is the boundary, not an omission. WHEN the bit flips is Pressability
 * plus a `delayPressOut` hold, running at gesture rate and calling back into app code
 * (`onShowUnderlay` / `onHideUnderlay`). WHAT a showing underlay looks like — a background colour and
 * a dimmed child, from two props no ViewConfig declares — is the platform's, and it is
 * `foldTouchableHighlightUnderlay` now.
 *
 * A flip is a GESTURE-rate event rather than a per-render one: twice a tap, against a `payloadFold`
 * that was charged on every commit the node was dirty in for the life of the screen.
 */
export const OP_SET_UNDERLAY_SHOWN = 12; // [slot, shown]

/**
 * A VOID node: commits nothing of its own AND does not hoist its children into Fabric either —
 * unlike an anchor, which hoists. `[slot]`.
 *
 * `InputAccessoryView.js` renders `null` on Android: the whole component, children included,
 * contributes nothing to the host tree. An anchor cannot express that — it exists precisely to hand
 * its children up in its own place — so a node whose entire subtree must vanish from Fabric needs
 * its own kind. Everything else about it (the retained JS tree, `appendChild`, adapter bookkeeping)
 * is unaffected; only the commit walk treats it as contributing zero Fabric nodes, recursively.
 */
export const OP_CREATE_VOID = 13; // [slot]

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

// TYPED FROM THE START, because the alternative is to walk the whole thing once per commit.
//
// This was a `number[]` and `takeBatch` ended in `Int32Array.from(ops)`. Measured on a 1 000-row
// create through the work ledger: **210 042 slots**, every one of them converted element by element
// through the ITERATOR PROTOCOL on every commit. `new Int32Array(array)` is not the escape — it
// takes the same path, checked rather than assumed (F-55). The escape is not building an Array.
//
// Capacity DOUBLES and is never given back: a commit that needed 210 042 slots once will need them
// again, and re-growing from a small start would pay the same copies every commit for the memory of
// a single benchmark row list.
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
const slots = new Map<object, number>();
// The same table for prop VALUES, and the reason it pays is the far side rather than this one: the
// host turns each entry into a `folly::dynamic` when the op is applied, so a style object reused
// across a thousand rows was a thousand conversions of one object. Measured on `build-release`,
// 12 005 `setProp` ops spent 20-29 ms converting inside a 35 ms `applyOps`.
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

/**
 * The index the ops address this value by — deduplicated when it is worth deduplicating.
 *
 * Objects, functions and strings go through the `Map`: they are the ones that repeat (one
 * `StyleSheet.create` object per screen, `ellipsizeMode: 'tail'` on every text node) and the ones
 * whose conversion costs something.
 *
 * BOOLEANS ARE FOLDED WITHOUT THE MAP, because there are two of them. A dedicated slot each is a
 * branch rather than a hash, so the argument that once excluded them — a lookup costs what the
 * conversion costs — does not reach this shape. And the conversion was never the whole cost:
 * `values` is a JSI array the host reads entry by entry, so a duplicate is a crossing whatever it
 * holds. Measured on the create fixture, three adapters seed `allowFontScaling: true` at
 * `createElement`, which alone wrote one entry per text node on the screen.
 *
 * NUMBERS STAY OUT. They would need the `Map`, whose keys compare by SameValueZero — that folds
 * `-0` into `0` and `NaN` into itself, and a value this cheap to convert is not worth opening the
 * question for.
 *
 * Identity, never structural equality: comparing deeply would make the buffer's cost depend on the
 * size of what it is handed, which is the opposite of the point.
 *
 * Reusing an index is safe against MUTATION of the value between two ops, and not by luck — the host
 * converts at apply time, after the batch has closed, so both ops already saw the object's final
 * state whether they shared an index or not.
 */
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

// Has anything changed the TREE since the last commit drained?
//
// NOT the same question as `hasPendingOps()`, and the difference is the whole reason this exists:
// every structural READ calls `flushOps`, so a reconciler that navigates the tree it is building
// empties the buffer many times between commits. `hasPendingOps()` then answers "no" for a surface
// with a screen's worth of unpublished work. This survives the drain and is cleared only by a
// commit, which is what "is there anything to publish" actually means.
//
// `OP_COMMIT` is excluded deliberately: recording a commit is not a change to the tree, and counting
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

/** Whether a commit would publish anything. See `changedSinceCommit`. */
export function hasChangedSinceCommit(): boolean {
  return changedSinceCommit;
}

/**
 * Called by `commitSurfaceOps` once it has drained. Separate from `takeBatch` because a READ drains
 * too, and a read is not a commit — clearing there would make the next commit believe its work had
 * already been published.
 */
export function noteCommitDrained(): void {
  changedSinceCommit = false;
}

/**
 * The one dirtying route that writes no op: a behavior with a DERIVED payload asks the host to
 * rebuild a node the buffer never named. Without this the commit that follows would look idle and
 * be skipped, and the derived payload would sit unpublished until something unrelated changed.
 */
export function noteHostSideChange(): void {
  changedSinceCommit = true;
}

// Nodes whose PLACEMENT this batch has not published yet — created, or named as the child of a
// structural op.
//
// It exists so a read does not have to drain. `parentOf` is unconditional otherwise, and Angular's
// 1 000-row create measured 1 002 drains for 1 000 reads of which ONE asked about a node the pending
// batch had touched (`adapters/angular/src/read-fragmentation.probe.test.ts`).
//
// THE CLAIM THAT MAKES IT SOUND: a node's parent link changes only through an op that names that
// node AS THE CHILD. `before` on an insert is a position reference and moves nothing; a parent
// argument moves the parent's list, not the parent's own link. So a handle absent from here has the
// same parent in the host as it has here.
//
// Creation is in it because the host cannot answer about a node it has never been told exists, which
// is the other half — and the half a "was it re-parented" set alone would get wrong.
//
// NOT A TREE, and that is the line this has to stay on the right side of (`node.ts:2` — no parent,
// no children, no mirror). It answers about the BUFFER: is this node's placement unpublished. It is
// emptied by `takeBatch`, so it never outlives one batch and can never disagree with the host.
let placementPending = new Set<object>();

/** Does the pending batch hold anything that could change what the host says this node's parent is? */
export function hasPendingPlacement(handle: object): boolean {
  return placementPending.has(handle);
}

export function recordCreateElement(
  handle: object,
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

export function recordCreateRawText(handle: object, text: string): void {
  placementPending.add(handle);
  push(OP_CREATE_RAW_TEXT, slotOf(handle), intern(text));
}

export function recordCreateAnchor(handle: object): void {
  placementPending.add(handle);
  push(OP_CREATE_ANCHOR, slotOf(handle));
}

export function recordCreateVoid(handle: object): void {
  placementPending.add(handle);
  push(OP_CREATE_VOID, slotOf(handle));
}

export function recordAppendChild(parent: object, child: object): void {
  placementPending.add(child);
  push(OP_APPEND_CHILD, slotOf(parent), slotOf(child));
}

export function recordInsertBefore(
  parent: object,
  child: object,
  before: object,
): void {
  placementPending.add(child);
  push(OP_INSERT_BEFORE, slotOf(parent), slotOf(child), slotOf(before));
}

export function recordRemoveChild(parent: object, child: object): void {
  placementPending.add(child);
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
  push(OP_SET_PROP, slotOf(handle), intern(key), internValue(value));
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

export function recordSetTag(handle: object, tag: string): void {
  push(OP_SET_TAG, slotOf(handle), intern(tag));
}

/**
 * Whether an app callback is currently wired to an event name the BEHAVIOR owns. `[slot, name,
 * present]`, `present` being 1 or 0.
 *
 * The EXISTENCE, never the function. A name a behavior owns is diverted into a JS stash by
 * `setEventListener` and never becomes a prop, so the payload builder sees no trace of it — and
 * `focusable` on a touchable is `focusable !== false && onPress !== undefined && !disabled`
 * (`TouchableOpacity.js:336-339`), two props and one thing only JS knew. This is the one bit that
 * closes that gap.
 *
 * The browser is the argument rather than convenience: a UA computes focusability itself and CAN,
 * because `addEventListener` is its own API — it knows which elements carry a click handler, while
 * the handler's body stays the application's. Same split.
 *
 * Emitted on a FLIP only, from `setEventListener`, which already refuses to notify on listener
 * identity because a framework hands a fresh closure nearly every render. So this is a mount-time
 * op, not a per-render one — against the per-commit fold it replaces.
 */
export function recordSetOwnedListener(
  handle: object,
  name: string,
  isPresent: boolean,
): void {
  push(OP_SET_OWNED_LISTENER, slotOf(handle), intern(name), isPresent ? 1 : 0);
}

/** See `OP_SET_UNDERLAY_SHOWN`. Emitted on a flip only, from the behavior that owns the timer. */
export function recordSetUnderlayShown(handle: object, shown: boolean): void {
  push(OP_SET_UNDERLAY_SHOWN, slotOf(handle), shown ? 1 : 0);
}

export function recordCommit(rootTag: number, surface: object): void {
  push(OP_COMMIT, rootTag, slotOf(surface));
}

/** Whether anything is pending. The commit path asks before paying for a drain. */
export function hasPendingOps(): boolean {
  return opCount > 0;
}

/**
 * Drain the buffer.
 *
 * Fresh arrays rather than reused ones: the batch outlives this call on the native path (`applyOps`
 * reads `handles` while attaching state), and a recycled array would be mutated under it by the next
 * mutation the adapter makes.
 *
 * `slice` for the ops and not `subarray` for exactly that reason — a subarray would share the
 * backing store the very next `push` writes into. It is a typed-array copy rather than the
 * element-by-element iterator walk this used to be, and the ops buffer itself is KEPT so its
 * capacity survives the drain.
 */
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
  slots.clear();
  valueIds.clear();
  trueId = NOT_INTERNED;
  falseId = NOT_INTERNED;
  return batch;
}

/** Test seam. Drops everything pending without applying it. */
export function resetMutationBuffer(): void {
  takeBatch();
}
