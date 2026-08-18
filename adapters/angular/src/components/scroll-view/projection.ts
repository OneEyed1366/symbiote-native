import {
  AnimatedProps,
  type AnimatedValue,
  dlog,
  isDebug,
  isAnchor,
  reduceProps,
  routeProp,
  whenCommitted,
  createElement,
  appendChild,
  insertBefore,
  removeChild,
  type AnimatedInterpolation,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import {
  createInitialStickyState,
  readLayoutNumber,
  reduceSticky,
  STICKY_HEADER_Z_INDEX,
  type IStickyAction,
  type IStickyEffect,
  type IStickyReducerInputs,
} from '@symbiote-native/components';
import { descriptorFor } from '@symbiote-native/components';
import { Platform } from '@symbiote-native/engine';

type IInsert = (parent: ISymbioteNode, child: ISymbioteNode, beforeChild?: ISymbioteNode) => void;
type IRemove = (parent: ISymbioteNode, child: ISymbioteNode) => void;

const contentProjection = new WeakMap<ISymbioteNode, ScrollViewProjectionController>();
// Which controller owns a projected child. Keyed by EVERY projected child, not only the wrapped
// ones: sticky indices are positional, so a child removed behind the controller's back leaves a dead
// record that inflates every later child's paint index (see removeScrollViewProjectedChild). A
// windowed list recycles cells continuously, so that drift grows with scroll distance.
const projectedOwners = new WeakMap<ISymbioteNode, ScrollViewProjectionController>();

// Controllers with a coalesced sticky reconcile owed, drained once per change-detection pass by
// flushScrollViewProjections (see ScrollViewProjectionController.scheduleReconcile for why the
// flush must be synchronous rather than a microtask). A strong Set is correct here: an entry lives
// only from the mutation that queued it to the end of that same pass.
const pendingProjections = new Set<ScrollViewProjectionController>();

/**
 * Run every sticky reconcile owed by this change-detection pass. Wired to the renderer factory's
 * `end()`, which Angular calls at the end of `ApplicationRef.tick` — after both channels that feed
 * a projection controller have written (children through the renderer, `stickyHeaderIndices` through
 * an `@Input`), and before the surface's microtask-coalesced commit runs.
 */
export function flushScrollViewProjections(): void {
  if (pendingProjections.size === 0) return;
  // Snapshot: a reconcile can wrap a record, and wrapping is itself a projected mutation.
  const owed = [...pendingProjections];
  pendingProjections.clear();
  for (const controller of owed) controller.flushReconcile();
}

interface IProjectedRecord {
  child: ISymbioteNode;
  wrapper: ISymbioteNode | undefined;
  sticky: StickyProjectionWrapper | undefined;
  stickyIndex: number | undefined;
}

export interface IScrollViewProjectionConfig {
  stickyHeaderIndices: readonly number[] | undefined;
  invertStickyHeaders: boolean | undefined;
  scrollViewHeight: number | undefined;
  scrollAnimatedValue: AnimatedValue;
  customStickyHeaderComponent: unknown;
  excludeRefreshControl: boolean;
}

function createViewNode(): ISymbioteNode {
  const descriptor = descriptorFor('symbiote-view');
  return createElement(descriptor.component, descriptor.isText);
}

function directNode(record: IProjectedRecord): ISymbioteNode {
  return record.wrapper ?? record.child;
}

function isProjectedRefreshControl(node: ISymbioteNode): boolean {
  if (node.component === 'PullToRefreshView' || node.component === 'AndroidSwipeRefreshLayout') {
    return true;
  }
  // Angular public <RefreshControl> is an anchor host whose real native refresh node lives inside
  // its component view. Projection filtering must recognize that anchor, otherwise iOS re-renders
  // a RefreshControl sibling and also leaves the projected one inside the scroll content.
  return isAnchor(node) && node.children.some(isProjectedRefreshControl);
}

// The SECOND Angular sticky effect-runner (auto-projected children can't be arbitrary Angular
// component classes, so the controller drives engine nodes directly). It shares the ONE
// reduceSticky state machine with ScrollViewStickyHeader — the DECISIONS (zero-swallow gate, debounce
// delay, rebuild ranges, cross-talk record) live there; this runner only EXECUTES the effects on the
// engine node (build interpolation + wire listener, hold the debounce timer, re-apply the node props).
// Because it owns the child index, it consumes the reducer's record-header-y effect for cross-talk.
// Diagnostic-only: a process-wide counter so each controller's log lines are attributable.
let projectionControllerSeq = 0;

class StickyProjectionWrapper {
  private readonly state = createInitialStickyState();
  private animatedTranslateY: AnimatedInterpolation;
  private interpolation: AnimatedInterpolation | undefined;
  private animatedProps: AnimatedProps | undefined;
  private cancelBind: (() => void) | undefined;
  private listenerId: string | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly controller: ScrollViewProjectionController,
    // NOT readonly: a window step renumbers every paint index below it without changing which child
    // this header is. See setChildIndex.
    private childIndex: number,
    private readonly node: ISymbioteNode,
  ) {
    this.animatedTranslateY = this.controller.config.scrollAnimatedValue.interpolate({
      inputRange: [-1, 0],
      outputRange: [0, 0],
    });
    dlog(
      `STICKY[wrap] created index=${childIndex} scrollValueIsNative=${this.controller.config.scrollAnimatedValue.__isNative()}`,
    );
    this.dispatch({ kind: 'inputs-changed' });
  }

  destroy(): void {
    this.cancelBind?.();
    this.cancelBind = undefined;
    if (this.interpolation !== undefined && this.listenerId !== undefined) {
      this.interpolation.removeListener(this.listenerId);
      this.listenerId = undefined;
    }
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    if (this.animatedProps !== undefined) {
      this.animatedProps.__detach();
      this.animatedProps = undefined;
    }
  }

  // The controller calls this when a cross-talk input changed (a sibling recorded its y): rebuild the
  // ranges off the new nextStickyHeaderY.
  rebuild(): void {
    this.dispatch({ kind: 'inputs-changed' });
  }

  // A window step renumbers every paint index below it while the header itself is unchanged: same
  // child, same measured layout, new position among the projected children. Recreating the wrapper
  // for that throws away `measured`/`layoutY` so the header re-measures from scratch, and costs a
  // native round trip per step (restoreDefaultValues + dropAnimatedNode out, a fresh interpolation +
  // AnimatedProps in). Feed the new index to the SAME state machine and let the reducer's range
  // guard decide whether anything must be rebuilt.
  //
  // Identity is the CHILD - it owns the record, the record owns this wrapper - never the position.
  // Angular CDK's virtual scroll makes the same call: on a window move `_updateContext` writes
  // `view.context.index = renderedRange.start + i` into the EXISTING view rather than recreating it,
  // and its trackBy is offset by `renderedRange.start` so identity stays absolute
  // (`cdk/scrolling/virtual-for-of.ts`).
  setChildIndex(next: number): void {
    if (this.childIndex === next) return;
    this.childIndex = next;
    this.dispatch({ kind: 'inputs-changed' });
  }

  private inputs(): IStickyReducerInputs {
    return {
      os: Platform.OS,
      inverted: this.controller.config.invertStickyHeaders,
      scrollViewHeight: this.controller.config.scrollViewHeight,
      nextHeaderLayoutY: this.controller.nextStickyHeaderY(this.childIndex),
      index: this.childIndex,
    };
  }

  private dispatch(action: IStickyAction): void {
    this.runEffects(reduceSticky(this.state, action, this.inputs()).effects);
  }

  private runEffects(effects: IStickyEffect[]): void {
    for (const effect of effects) {
      switch (effect.kind) {
        case 'rebuild-interpolation': {
          if (this.interpolation !== undefined && this.listenerId !== undefined) {
            this.interpolation.removeListener(this.listenerId);
            this.listenerId = undefined;
          }
          const next = this.controller.config.scrollAnimatedValue.interpolate({
            inputRange: effect.inputRange,
            outputRange: effect.outputRange,
          });
          this.listenerId = next.addListener(this.animatedValueListener);
          this.interpolation = next;
          this.animatedTranslateY = next;
          this.applyProps();
          dlog(
            `STICKY[wrap] rebuilt index=${this.childIndex} measured=${this.state.measured} y=${this.state.layoutY}`,
          );
          break;
        }
        case 'schedule-debounce':
          if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer);
          this.debounceTimer = setTimeout(() => {
            this.debounceTimer = undefined;
            this.dispatch({ kind: 'debounce-fired', value: effect.value });
          }, effect.delay);
          break;
        case 'apply-passthrough':
          this.applyProps();
          break;
        case 'record-header-y':
          this.controller.recordHeaderLayoutY(effect.index, effect.y);
          break;
      }
    }
  }

  private readonly onLayout = (event: ISymbioteEvent): void => {
    const y = readLayoutNumber(event, 'y');
    const height = readLayoutNumber(event, 'height');
    dlog(`STICKY[wrap] index=${this.childIndex} onLayout y=${y} height=${height}`);
    // Keep the previous value when a field is absent (RN sets state only on a defined read).
    this.dispatch({
      kind: 'layout',
      y: y ?? this.state.layoutY,
      height: height ?? this.state.layoutHeight,
    });
  };

  // The ONLY thing that drives the committed pin on this path: applyProps has no __makeNative(),
  // so the wrapper is JS-driven end to end. If the scroll value has been made native up front the
  // cascade to child listeners stops (AnimatedWithChildren.__callListeners skips children once
  // isNative) and this never fires - the header then renders in place and never moves.
  private readonly animatedValueListener = ({ value }: { value: number | string }): void => {
    dlog(() => `STICKY[wrap] index=${this.childIndex} animated-tick value=${String(value)}`);
    if (typeof value === 'number') this.dispatch({ kind: 'animated-tick', value });
  };

  private props(): Record<string, unknown> {
    const style = {
      transform: [{ translateY: this.animatedTranslateY }],
      zIndex: STICKY_HEADER_Z_INDEX,
    };
    const passthrough =
      this.state.translateY === null
        ? undefined
        : { transform: [{ translateY: this.state.translateY }], zIndex: STICKY_HEADER_Z_INDEX };
    return {
      style: passthrough === undefined ? style : [style, passthrough],
      onLayout: this.onLayout,
      collapsable: false,
    };
  }

  private applyProps(): void {
    const props = this.props();
    const reduced = reduceProps(props);
    // Thunk: applyProps is on the scroll-driven path (every animated-tick while the pin is
    // JS-driven), and JSON.stringify of a reduced transform is not free.
    dlog(
      () =>
        `STICKY[wrap] index=${this.childIndex} applyProps translateY=${String(this.state.translateY)} ` +
        `measured=${this.state.measured} layoutY=${this.state.layoutY} ` +
        `scrollValueIsNative=${this.controller.config.scrollAnimatedValue.__isNative()} ` +
        `reducedTransform=${JSON.stringify(reduced.transform ?? reduced.style)}`,
    );
    for (const [key, value] of Object.entries(reduced)) routeProp(this.node, key, value);

    const next = new AnimatedProps(props);
    next.__attach();
    // No explicit __makeNative() here on purpose: __attach joins the leaf to the interpolation,
    // which sits under the shared scroll value, and AnimatedWithChildren.__addChild promotes a
    // child joining an ALREADY-native parent (graph.ts). So the pin is native exactly when the
    // scroll value is - logged below, because "is this actually on the UI thread" is otherwise
    // invisible until you read three files.
    dlog(
      () =>
        `STICKY[wrap] index=${this.childIndex} leaf attached isNative=${next.__isNative()} ` +
        `interpolationIsNative=${this.animatedTranslateY.__isNative()} ` +
        `scrollValueIsNative=${this.controller.config.scrollAnimatedValue.__isNative()}`,
    );
    if (this.animatedProps !== undefined) this.animatedProps.__detach();
    this.animatedProps = next;
    this.cancelBind?.();
    this.cancelBind = whenCommitted(this.node, () => {
      next.setNativeView(this.node);
      dlog(`STICKY[wrap] index=${this.childIndex} setNativeView isNative=${next.__isNative()}`);
    });
  }
}

export class ScrollViewProjectionController {
  config: IScrollViewProjectionConfig;
  private contentNode: ISymbioteNode | undefined;
  private readonly records: IProjectedRecord[] = [];
  private readonly headerLayoutYs = new Map<number, number>();

  // Diagnostic-only: one ScrollView can host several projection controllers over its lifetime,
  // and an app has several ScrollViews at once. Without an id every log line below is
  // indistinguishable between instances, which is what made a "logs never stop" report
  // impossible to read as either a real loop or two lists warming up in turn.
  private readonly instanceId = ++projectionControllerSeq;
  private reconcileSeq = 0;
  private isReconcilePending = false;
  private shouldNotifyAll = false;

  constructor(config: IScrollViewProjectionConfig) {
    this.config = config;
  }

  update(config: IScrollViewProjectionConfig): void {
    this.config = config;
    // The one caller that must notify every wrapper: scrollViewHeight / invertStickyHeaders live in
    // this config and reach the wrappers through nothing else.
    this.scheduleReconcile(true);
  }

  /**
   * Coalesce every reconcile request of one change-detection pass into a SINGLE walk.
   *
   * Cost is half the reason: the walk is O(records), so running it per projected mutation makes
   * mounting M children O(M^2) - 801 children on the benchmark screen's PATH A. Correctness is the
   * worse half. A windowed list feeds the controller through TWO channels that land at different
   * moments in the same pass: children arrive through the renderer (insert/remove), while
   * `stickyHeaderIndices` arrive as an ordinary `@Input` via `update()` from ngOnChanges. Reconciling
   * on each mutation therefore guarantees at least one walk matching the NEW children against the
   * OLD indices - and those indices are positions in the rendered child array
   * (`stickyChildPositions`), which shift by 1-3 the moment VirtualizedList grows a leading spacer or
   * a forced sticky cell. Every mismatch re-labels a header and re-parents engine nodes for nothing.
   *
   * The flush point is `RendererFactory2.end()`: the end of the pass, still SYNCHRONOUS. It must not
   * be a microtask - engine mutations only `markDirty`, the commit is microtask-coalesced by the
   * surface, and a reconcile queued after that commit mutates a tree nobody commits again. Headless
   * the sticky wrapper then never reaches Fabric at all (six tests caught exactly this); on device it
   * lands a frame late or not at all. `end()` runs inside `ApplicationRef.tick`, so it precedes every
   * microtask queued during the pass.
   */
  private scheduleReconcile(notifyAll = false): void {
    this.shouldNotifyAll ||= notifyAll;
    if (this.isReconcilePending) return;
    this.isReconcilePending = true;
    pendingProjections.add(this);
  }

  // Called by the renderer factory's end(). Public only for that seam.
  flushReconcile(): void {
    this.isReconcilePending = false;
    const notifyAll = this.shouldNotifyAll;
    this.shouldNotifyAll = false;
    this.reconcileStickyRecords(notifyAll);
  }

  bindContentNode(node: ISymbioteNode): void {
    dlog(
      `Angular ScrollView projection bindContentNode node=${node.component} preExistingChildren=${node.children.length} recordsBefore=${this.records.length}`,
    );
    this.contentNode = node;
    contentProjection.set(node, this);
    if (this.records.length === 0 && node.children.length > 0) {
      for (const child of [...node.children]) {
        this.records.push({ child, wrapper: undefined, sticky: undefined, stickyIndex: undefined });
        projectedOwners.set(child, this);
      }
    }
    this.scheduleReconcile();
  }

  appendProjectedChild(parent: ISymbioteNode, child: ISymbioteNode, insert: IInsert): void {
    dlog(
      `Angular ScrollView projection appendProjectedChild parent=${parent.component} child=${child.component} recordsBefore=${this.records.length}`,
    );
    const existing = this.records.find(record => record.child === child);
    if (existing !== undefined) this.records.splice(this.records.indexOf(existing), 1);
    const record: IProjectedRecord = {
      child,
      wrapper: undefined,
      sticky: undefined,
      stickyIndex: undefined,
    };
    this.records.push(record);
    projectedOwners.set(child, this);
    this.insertRecord(parent, record, undefined, insert);
    this.scheduleReconcile();
  }

  insertProjectedChild(
    parent: ISymbioteNode,
    child: ISymbioteNode,
    beforeChild: ISymbioteNode | null,
    insert: IInsert,
  ): void {
    dlog(
      `Angular ScrollView projection insertProjectedChild parent=${parent.component} child=${child.component} before=${beforeChild ? `${beforeChild.component}` : 'null'} recordsBefore=${this.records.length}`,
    );
    const existing = this.records.find(record => record.child === child);
    if (existing !== undefined) this.records.splice(this.records.indexOf(existing), 1);
    const beforeRecord =
      beforeChild === null
        ? undefined
        : this.records.find(
            record => record.child === beforeChild || record.wrapper === beforeChild,
          );
    const record: IProjectedRecord = {
      child,
      wrapper: undefined,
      sticky: undefined,
      stickyIndex: undefined,
    };
    // An insert-BEFORE whose anchor is not a record degrades into an append, here and again in
    // insertRecord below - silently, which is how an ordering fault stays invisible until the screen
    // is already wrong. A list that only ever appends (the benchmark screen's PATH A) never hits it;
    // a virtualized list recycling cells into the middle does.
    if (beforeChild !== null && beforeRecord === undefined) {
      dlog(
        () =>
          `STICKY[proj#${this.instanceId}] ORDER insert-before anchor NOT a record ` +
          `child=${child.component} before=${beforeChild.component} -> APPENDED to end`,
      );
    }
    const index =
      beforeRecord === undefined ? this.records.length : this.records.indexOf(beforeRecord);
    this.records.splice(index, 0, record);
    projectedOwners.set(child, this);
    this.insertRecord(parent, record, beforeRecord, insert);
    this.scheduleReconcile();
  }

  removeProjectedChild(child: ISymbioteNode, remove: IRemove): boolean {
    const record = this.records.find(entry => entry.child === child || entry.wrapper === child);
    if (record === undefined || this.contentNode === undefined) return false;
    record.sticky?.destroy();
    projectedOwners.delete(record.child);
    const direct = directNode(record);
    // The wrapper, when there is one, is the node actually parented to the content — detach
    // whichever of the two carries the link, so a wrapped child never leaves its wrapper behind.
    if (direct.parent !== undefined) remove(direct.parent, direct);
    this.records.splice(this.records.indexOf(record), 1);
    this.scheduleReconcile();
    return true;
  }

  nextStickyHeaderY(index: number): number | undefined {
    const stickyIndices = this.config.stickyHeaderIndices ?? [];
    const next = stickyIndices.find(entry => entry > index);
    const y = next === undefined ? undefined : this.headerLayoutYs.get(next);
    dlog(`STICKY[proj] nextStickyHeaderY(index=${index}) next=${next} y=${y}`);
    return y;
  }

  recordHeaderLayoutY(index: number, y: number): void {
    dlog(`STICKY[proj] recordHeaderLayoutY index=${index} y=${y}`);
    if (this.headerLayoutYs.get(index) === y) return;
    this.headerLayoutYs.set(index, y);
    // EXACTLY ONE wrapper reads this value. `nextStickyHeaderY(i)` returns the first sticky index
    // greater than i, so `index` is the "next header" of the closest sticky index BELOW it and of
    // no one else. Broadcasting to all of them instead cost O(N) per layout and O(N^2) to settle a
    // screen - 200 headers answered "ranges unchanged, skipped rebuild" 199 times per layout event,
    // 40 000 dispatches to lay out the benchmark screen's PATH A.
    const stickyIndices = this.config.stickyHeaderIndices ?? [];
    let previous: number | undefined;
    // Same ascending-order assumption nextStickyHeaderY already makes.
    for (const entry of stickyIndices) {
      if (entry >= index) break;
      previous = entry;
    }
    if (previous === undefined) return;
    this.records.find(record => record.stickyIndex === previous)?.sticky?.rebuild();
  }

  private insertRecord(
    parent: ISymbioteNode,
    record: IProjectedRecord,
    beforeRecord: IProjectedRecord | undefined,
    insert: IInsert,
  ): void {
    const before = beforeRecord === undefined ? undefined : directNode(beforeRecord);
    dlog(
      `STICKY[proj#${this.instanceId}] insertRecord child=${record.child.component} ` +
        `before=${before ? before.component : 'append'} parentIsContentNode=${parent === this.contentNode}`,
    );
    if (before === undefined) insert(parent, record.child);
    else insert(parent, record.child, before);
  }

  // notifyAll re-dispatches every sticky wrapper's inputs. Only a CONFIG change needs that
  // (scrollViewHeight / invertStickyHeaders arrive through update() and reach the wrappers nowhere
  // else). An INSERT must not: this walk runs once per projected child, so notifying N wrappers on
  // each of M inserts is M x N - 801 x 200 = 160 200 dispatches to mount the benchmark screen's
  // PATH A, versus 70 x 3 = 210 on the canary, which is why only the big screen dies. The two input
  // changes an insert can actually cause are covered without a broadcast: a shifted childIndex by
  // the stickyIndex branch below, and a moved neighbour by recordHeaderLayoutY.
  private reconcileStickyRecords(notifyAll = false): void {
    if (this.contentNode === undefined) return;
    const seq = ++this.reconcileSeq;
    dlog(
      () =>
        `STICKY[proj#${this.instanceId}] reconcile#${seq} records=${this.records.length} ` +
        `children=${this.contentNode?.children.length} sticky=${JSON.stringify(this.config.stickyHeaderIndices ?? [])}`,
    );
    const stickyIndices = new Set(this.config.stickyHeaderIndices ?? []);
    if (this.config.customStickyHeaderComponent !== undefined && stickyIndices.size > 0) {
      dlog(
        'STICKY[proj] uses built-in sticky wrapper; custom StickyHeaderComponent is explicit-composition only',
      );
    }

    let paintIndex = 0;
    for (const record of [...this.records]) {
      if (this.config.excludeRefreshControl && isProjectedRefreshControl(record.child)) {
        // Removed INLINE, not through removeProjectedChild: that method ends with its own
        // reconcileStickyRecords(), so calling it from inside this walk re-enters the walk while
        // this.records is being spliced under it - one refresh control could then drive an
        // unbounded recursion. Same removal, without the re-entry.
        this.dropRecord(record);
        continue;
      }
      const countsAsChild = !isAnchor(record.child) && !isProjectedRefreshControl(record.child);
      const childIndex = paintIndex;
      if (countsAsChild) paintIndex += 1;
      const shouldWrap = countsAsChild && stickyIndices.has(childIndex);
      // Deliberately NOT logged per child per walk: reconcile runs on every projected insert, so
      // that shape is O(children x inserts) and buries the few lines that carry information. Only
      // a state TRANSITION is logged, below.
      if (shouldWrap && record.wrapper === undefined) this.wrapRecord(record, childIndex);
      else if (!shouldWrap && record.wrapper !== undefined) this.unwrapRecord(record);
      else if (shouldWrap && record.stickyIndex !== childIndex) {
        record.sticky?.setChildIndex(childIndex);
        record.stickyIndex = childIndex;
      } else if (shouldWrap && notifyAll) record.sticky?.rebuild();
    }

    // `paintIndex` above is counted off RECORDS, but the screen paints `contentNode.children`. The
    // reconcile line at the top prints only the two COUNTS, which stay equal under any permutation
    // - so it can never see this. Once the orders diverge, every sticky index addresses the wrong
    // child and each wrap moves another node, so the fault compounds with scroll distance instead
    // of correcting itself. Guarded by isDebug because it walks both lists.
    if (!isDebug()) return;
    const expected = this.records.map(record => directNode(record));
    const painted = this.contentNode?.children ?? [];
    const at = expected.findIndex((node, index) => node !== painted[index]);
    if (at >= 0 || expected.length !== painted.length) {
      dlog(
        `STICKY[proj#${this.instanceId}] ORDER DIVERGED at ${at} ` +
          `records=${expected.length} painted=${painted.length} ` +
          `expected=${expected[at]?.component ?? 'none'} painted=${painted[at]?.component ?? 'none'}`,
      );
    }
  }

  // The removal half of removeProjectedChild, without its trailing reconcile - safe to call from
  // inside the reconcile walk itself.
  private dropRecord(record: IProjectedRecord): void {
    if (this.contentNode === undefined) return;
    record.sticky?.destroy();
    projectedOwners.delete(record.child);
    const direct = directNode(record);
    if (direct.parent === this.contentNode) removeChild(this.contentNode, direct);
    const index = this.records.indexOf(record);
    if (index !== -1) this.records.splice(index, 1);
  }

  // Auto projection runs after Angular has already created projected child host nodes. At this
  // renderer boundary we can AOT-safely rearrange engine nodes, but we cannot instantiate an
  // arbitrary Angular component class as a wrapper without owning a ViewContainerRef/injector and
  // Angular projectable nodes for its <ng-content>. Therefore the automatic sticky path always uses
  // the built-in engine-node wrapper; custom StickyHeaderComponent wrappers remain supported by
  // explicit Angular composition with <ScrollViewStickyHeader>/<symbiote-sticky-header> or a user
  // component that composes it in the template.
  private wrapRecord(record: IProjectedRecord, childIndex: number): void {
    if (this.contentNode === undefined) return;
    const wrapper = createViewNode();
    // The slot comes from `records`, the list that always knows where this record sits, never from
    // the child's own current parent. Read off the child, a child not sitting DIRECTLY in the content
    // has no slot to give up and the wrapper lands at the END - the wrapped cell jumps to the bottom
    // of the scroll content, a silent reordering that compounds with scroll distance instead of
    // correcting itself, and a windowed list reaches that state routinely. Angular CDK carries the
    // same warning at its own insert site: insert AT the index, never insert-then-move, because an
    // extra anchor node in between throws the move off (`cdk/scrolling/virtual-for-of.ts`,
    // `_getEmbeddedViewArgs`) - and this file's tree is full of anchors.
    //
    // Order is load-bearing: place the wrapper at the slot FIRST, then move the child into it. The
    // engine's appendChild detaches the child from its old parent, so the wrapper slides into the
    // position the child vacates and no explicit removeChild is needed.
    const after = this.nextDirectAfter(record);
    if (after === undefined) appendChild(this.contentNode, wrapper);
    else insertBefore(this.contentNode, wrapper, after);
    appendChild(wrapper, record.child);
    record.wrapper = wrapper;
    record.sticky = new StickyProjectionWrapper(this, childIndex, wrapper);
    record.stickyIndex = childIndex;
    dlog(
      `STICKY[proj#${this.instanceId}] WRAP child=${record.child.component} paintIndex=${childIndex}`,
    );
  }

  // The painted node of the first record AFTER `record` that is actually parented to the content —
  // i.e. the anchor the wrapper must be inserted before. Records whose node has not been inserted
  // yet are skipped rather than treated as a slot: a record exists from the moment the renderer
  // reports the child, which can precede its placement.
  private nextDirectAfter(record: IProjectedRecord): ISymbioteNode | undefined {
    for (let index = this.records.indexOf(record) + 1; index < this.records.length; index += 1) {
      const node = directNode(this.records[index]);
      if (node.parent === this.contentNode) return node;
    }
    return undefined;
  }

  private unwrapRecord(record: IProjectedRecord): void {
    if (this.contentNode === undefined || record.wrapper === undefined) return;
    dlog(`STICKY[proj#${this.instanceId}] UNWRAP child=${record.child.component}`);
    record.sticky?.destroy();
    record.sticky = undefined;
    record.stickyIndex = undefined;
    const wrapper = record.wrapper;
    insertBefore(this.contentNode, record.child, wrapper);
    removeChild(this.contentNode, wrapper);
    record.wrapper = undefined;
  }
}

export function getScrollViewProjection(
  node: ISymbioteNode,
): ScrollViewProjectionController | undefined {
  return contentProjection.get(node);
}

export function removeScrollViewProjectedChild(child: ISymbioteNode, remove: IRemove): boolean {
  return projectedOwners.get(child)?.removeProjectedChild(child, remove) ?? false;
}
