/**
 * The test API for code running inside `symbiote_tester`, and it is deliberately tiny.
 *
 * Vitest cannot run here — this is a JSI runtime with no Node, no modules and no filesystem — so
 * there is a floor of test API that has to exist on this side. React Native's own host harness has
 * the same floor and answers it the same way (`private/react-native-fantom/runtime/setup.js`).
 * Everything above it belongs to the runner, which is Node and can use whatever it likes.
 *
 * The protocol is one line per result on stdout. That is what makes the runner replaceable.
 */

/** A command a test dispatched at a mounted view — `dispatchCommand`'s own three arguments. */
export type IRecordedCommand = {
  tag: number;
  commandName: string;
  args: unknown;
};

declare const __symbioteTester: {
  mounted: () => IMountedView;
  committedShape: () => string;
  committedTags: () => number[];
  committedTexts: () => string[];
  committedTree: () => ICommittedNode | null;
  dispatchEvent: (
    tag: number,
    type: string,
    payload?: Record<string, unknown>,
  ) => void;
  commands: () => IRecordedCommand[];
  mountingLogs: () => string[];
  commitNumber: () => number;
  heapInfo: () => Record<string, number>;
  collectGarbage: () => void;
  startProfiling: (hz: number) => boolean;
  stopProfiling: (path: string) => boolean;
  reset: () => void;
  print: (line: string) => void;
};

/**
 * Fire a native event at a MOUNTED view, by the tag the platform gave it.
 *
 * The tag has to come from `mounted()`, which is the constraint that makes this honest: an event
 * can only be aimed at a view that exists natively. It then travels the real pipeline — event
 * queue, `UIManagerBinding::dispatchEvent`, the instance handle, the listener.
 */
export function dispatchEvent(
  tag: number,
  type: string,
  payload?: Record<string, unknown>,
): void {
  __symbioteTester.dispatchEvent(tag, type, payload);
}

/** A view as the PLATFORM holds it: what the differ told a host to create, not what JS built. */
export type IMountedView = {
  viewName: string;
  tag: number;
  /**
   * The props standing on the view, as React Native's own introspection reports them.
   *
   * INCOMPLETE BY DESIGN, and a test must not read an absent key as "the prop did not arrive".
   * `getDebugProps` is a hand-written selection — `BaseViewProps` lists six — so `transformOrigin`,
   * to name one, never appears whatever its value. The complete read-back is `Props::rawProps`
   * under `RN_SERIALIZABLE_STATE`, which does not build off Android (`State.h` includes fbjni).
   *
   * So: a key that IS here arrived and carries the value Fabric parsed. A key that is not here says
   * nothing either way. Questions about what the engine SENT belong to `fabricProps` — shipped JS,
   * testable directly, and not a model of anything.
   */
  props: Record<string, string>;
  layout: { x: number; y: number; width: number; height: number };
  children: IMountedView[];
};

type ICase = { name: string; run: () => unknown };

const cases: ICase[] = [];
const beforeEachHooks: (() => unknown)[] = [];
const afterEachHooks: (() => unknown)[] = [];
let group = '';

export function test(name: string, run: () => unknown): void {
  cases.push({ name: group === '' ? name : `${group} > ${name}`, run });
}

export function beforeEach(hook: () => unknown): void {
  beforeEachHooks.push(hook);
}

export function afterEach(hook: () => unknown): void {
  afterEachHooks.push(hook);
}

/** Grouping only, so a migrated file keeps the shape it had under vitest. */
export function describe(name: string, body: () => void): void {
  const outer = group;
  group = outer === '' ? name : `${outer} > ${name}`;
  body();
  group = outer;
}

export { test as it };

/** Everything the platform holds right now, mounting anything committed since the last call. */
export function mounted(): IMountedView {
  return __symbioteTester.mounted();
}

/**
 * The committed SHADOW tree as `name(children…)` — a different tree from the mounted one.
 *
 * Reach for it when the subject is a node the platform never sees as a view: the text a `<Text>` is
 * made of is an attributed string, not a view, so `RCTVirtualText` and `RCTRawText` appear HERE and
 * never in `mounted()`. Reach for `mounted()` whenever the question is what the platform holds.
 *
 * Both are read out of React Native; neither is a model. They are two real trees, and the distance
 * between them is a fact about Fabric rather than a shortcoming of either read.
 */
export function committedShape(): string {
  return __symbioteTester.committedShape();
}

/**
 * Every tag in the committed shadow tree, the root's included.
 *
 * The tags Fabric actually holds. Headless, these used to come out of the TypeScript applier, which
 * meant a tag test proved that the stand-in's allocator was well behaved — and the allocator whose
 * collisions crash the app is the one in `SymbioteTree.cpp`.
 */
export function committedTags(): number[] {
  return __symbioteTester.committedTags();
}

/**
 * Every raw-text string in the committed shadow tree, in document order.
 *
 * The shape says a `RawText` node is there; this says what is in it — and, more to the point, which
 * ones are there at all. An empty raw text must never reach a child set (it aborts Fabric's text
 * walk), and no shape can distinguish an empty node from an absent one.
 */
export function committedTexts(): string[] {
  return __symbioteTester.committedTexts();
}

/**
 * A node as FABRIC committed it: every node, including the ones the platform never sees.
 *
 * The distinction against `IMountedView` is the whole point of having both. A view with nothing on
 * it is flattened and never mounts; a `<Text>`'s contents are an attributed string and never mount.
 * Both are here. So "did this node reach the renderer, and with what props" is answered here, and
 * "what does the platform hold" is answered by `mounted()` — they are different questions and a
 * test has to say which one it means.
 */
export type ICommittedNode = {
  viewName: string;
  tag: number;
  /** The same hand-written selection `IMountedView.props` carries, with the same caveat. */
  props: Record<string, string>;
  children: ICommittedNode[];
};

/** The committed shadow tree, or undefined before anything has committed. */
export function committedTree(): ICommittedNode | undefined {
  return __symbioteTester.committedTree() ?? undefined;
}

/** The first committed node matching `predicate`, depth-first from the root. */
export function findCommitted(
  predicate: (node: ICommittedNode) => boolean,
  from: ICommittedNode | undefined = committedTree(),
): ICommittedNode | undefined {
  if (from === undefined) return undefined;
  if (predicate(from)) return from;
  for (const child of from.children) {
    const found = findCommitted(predicate, child);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Every committed node matching `predicate`, in document order. */
export function findAllCommitted(
  predicate: (node: ICommittedNode) => boolean,
  from: ICommittedNode | undefined = committedTree(),
): ICommittedNode[] {
  if (from === undefined) return [];
  const found = predicate(from) ? [from] : [];
  for (const child of from.children) {
    found.push(...findAllCommitted(predicate, child));
  }
  return found;
}

/** `name(children…)` — the one-line form a shape assertion reads best in. */
export function shapeOf(view: IMountedView): string {
  return `${view.viewName}(${view.children.map(shapeOf).join('')})`;
}

/**
 * A committed subtree as `name{key=value,…}(children…)` — every node, every prop, no tags.
 *
 * The one thing the mutation oracle cannot compare. `StubViewTree::recordMutation` writes a line
 * holding `type`, `nativeID` and `index` and NOTHING ELSE, so two arms can agree mutation for
 * mutation and still hand the platform different payloads — and on a device the payload is what
 * `updateProps:oldProps:` costs, field by differing field.
 *
 * Tag-free on purpose: two arms number their nodes differently and always will, so a dump carrying
 * tags can only ever differ. Keys are sorted for the same reason — `getDebugProps` builds its list
 * in each props class's own order, and a diff must not turn on it.
 *
 * INCOMPLETE, with the same caveat as `IMountedView.props`: `getDebugProps` is a hand-written
 * selection that also omits any value equal to its default. A key present here is real; a key absent
 * says nothing. So this compares arms against EACH OTHER, and proves no absolute claim about either.
 */
export function payloadOf(node: ICommittedNode): string {
  const props = Object.keys(node.props)
    .sort()
    .map(key => `${key}=${node.props[key]}`)
    .join(',');
  return `${node.viewName}{${props}}(${node.children.map(payloadOf).join('')})`;
}

/**
 * The mounted view carrying this `testID`, or undefined.
 *
 * This is the read most migrated tests want, and it replaces `fabric.appRoot().children[i]…` rather
 * than translating it. **There is no `appRoot()` here and there cannot be**: the surface node
 * carries `flex: 1` and `pointerEvents: box-none`, and neither makes a view real to Fabric
 * (`box-none` is not in the stacking-context list — only `box-only` and `none` are), so it is
 * FLATTENED and no such native view exists. Indexing down from a container that is not there is how
 * a shape assertion ends up describing a tree the device never had.
 *
 * A `testID` is also what makes the view survive flattening, so asking for one is not a workaround:
 * it is the same thing a real app does to make a view findable.
 */
export function findByTestId(
  testID: string,
  from: IMountedView = mounted(),
): IMountedView | undefined {
  if (from.props.testID === testID) return from;
  for (const child of from.children) {
    const found = findByTestId(testID, child);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Every command dispatched at a mounted view since the last reset, in order.
 *
 * The real `nativeFabricUIManager.dispatchCommand` pipeline (`UIManagerBinding.cpp` ->
 * `UIManager::dispatchCommand` -> the delegate this harness installs), the entry an imperative ref
 * call actually reaches on a device — `setNativeProps`'s sibling, `focus`, `scrollTo`, a controlled
 * `<text-input>`'s write-back. `tag` is the shadow node's own committed Fabric tag.
 */
export function commands(): IRecordedCommand[] {
  return __symbioteTester.commands();
}

/**
 * What the real Differentiator told the mounting platform to do since the last read, in React
 * Native's own wording ("Create {...}", "Update {...}", "Insert {...}", …).
 *
 * Populated by `mounted()`'s own `host.mount()` drain, so call `mounted()` first — this only
 * reads what that drain produced, it does not trigger one of its own. An "Update" line is the
 * real equivalent of the retired TypeScript mirror's clone-protocol count: the Differentiator
 * decided this node's props changed enough to need a native prop update, not merely that JS wrote
 * to it (`setProp`'s own `Object.is` dedupe can still turn a write away before it ever reaches
 * here — see `core/engine/src/node.ts`).
 */
export function mountingLogs(): string[] {
  return __symbioteTester.mountingLogs();
}

/**
 * The shadow tree's running commit number — a step's own commit count is the delta across it.
 *
 * The one headless instrument that speaks about a cost living PAST `completeRoot`, where the
 * device's overhead sits and where the mutation oracle goes blind: each commit signals the mounting
 * thread, and on a device that is `RCTMountingManager` creating and configuring `UIView`s on the
 * main thread. Two renderers can emit an identical mutation list and still cost differently there
 * if one of them splits it across more commits.
 *
 * NOT a transaction count, which reads 1 whatever happens — `MountingCoordinator::pullTransaction`
 * diffs the base revision against the latest, so intermediate commits collapse and the loop that
 * pulls them counts the caller's own drains.
 */
export function commitNumber(): number {
  return __symbioteTester.commitNumber();
}

/**
 * The engine's heap and GC counters — `hermes_totalAllocatedBytes`, `hermes_allocatedBytes`,
 * `hermes_heapSize`, `hermes_numCollections`, `hermes_peakAllocatedBytes`, `hermes_peakLiveAfterGC`.
 *
 * The axis every other instrument here is blind to. A wall clock prices the work a commit does; what
 * that work ALLOCATES is a second cost, paid later and elsewhere, and a device heap pays it far more
 * often than a Mac does. `numCollections` and cumulative allocation are what a renderer comparison
 * on Hermes turns on — see the octane thread linked from the measurement skill.
 *
 * EMPTY ON JAVASCRIPTCORE: jsi's default `getHeapInfo` returns an empty map, so a reader gets
 * nothing rather than a wrong number. Check before dividing.
 */
export function heapInfo(): Record<string, number> {
  return __symbioteTester.heapInfo();
}

/** A full collection, so a measurement starts from a known floor. */
export function collectGarbage(): void {
  __symbioteTester.collectGarbage();
}

/** Hermes's sampling profiler; false on JavaScriptCore. Pair with `stopProfiling`. */
export function startProfiling(hz: number): boolean {
  return __symbioteTester.startProfiling(hz);
}

/** Stop sampling and write a Chrome-format trace to `path`. */
export function stopProfiling(path: string): boolean {
  return __symbioteTester.stopProfiling(path);
}

/**
 * What the differ told the platform to do since the last read, keyed `Kind/ComponentName`.
 *
 * The drain is included, because `mountingLogs()` without it reads empty forever: until a
 * transaction is pulled the commit exists only as a shadow-tree revision and the differ has not run.
 *
 * Why the TYPE is in the key and not only the kind: a total cannot say whether an arm told the host
 * about a row or about everything inside it, and that distinction is the only reason to count at
 * all. `StubViewTree` quotes the component name (`type: "View"`), so the quotes are part of the
 * pattern rather than decoration — drop them and every line falls through to `?`.
 */
export function countMutations(): Map<string, number> {
  mounted();
  const counts = new Map<string, number>();
  for (const log of mountingLogs()) {
    const kind = log.slice(0, log.indexOf(' '));
    const type = /type: "([A-Za-z0-9_]+)"/.exec(log)?.[1] ?? '?';
    const key = `${kind}/${type}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** `countMutations()` as one sorted line, for a `print`. */
export function mutationSummary(counts: Map<string, number>): string {
  let total = 0;
  for (const count of counts.values()) total += count;
  return (
    `total=${total} :: ` +
    [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, count]) => `${key}=${count}`)
      .join(' ')
  );
}

declare const __symbioteFlushTimers: (rounds?: number) => void;

/**
 * Run every queued timer callback, repeatedly, until none is left.
 *
 * This runtime has no event loop, so `setTimeout` queues instead of scheduling (the runner's
 * prelude). A scheduler-driven framework — React is the one that needs this — does its work in
 * those callbacks, so a test calls this at the point work should have settled. Explicit rather
 * than automatic, and deterministic rather than racing a clock, the same deal the event beat makes.
 */
export function flushTimers(): void {
  __symbioteFlushTimers();
}

/** Diagnostics from inside a case. One line, straight to the runner's stdout. */
export function print(line: string): void {
  __symbioteTester.print(line);
}

export function expect(actual: unknown): {
  toBe: (expected: unknown) => void;
  toEqual: (expected: unknown) => void;
  toContain: (expected: unknown) => void;
  toBeDefined: () => void;
  toBeGreaterThan: (expected: number) => void;
  toBeLessThan: (expected: number) => void;
} {
  const fail = (expected: unknown): never => {
    throw new Error(
      `expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  };
  return {
    toBe(expected: unknown): void {
      if (!Object.is(actual, expected)) fail(expected);
    },
    // Structural, by serialisation. Enough for what crosses this boundary — everything arrives as
    // plain JSON from C++, so there is no class identity or cycle for a deep walk to discover.
    toEqual(expected: unknown): void {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(expected);
    },
    toContain(expected: unknown): void {
      if (typeof actual === 'string' && typeof expected === 'string') {
        if (!actual.includes(expected)) fail(expected);
        return;
      }
      if (!Array.isArray(actual)) {
        throw new Error(
          `toContain expects an array or a string, received ${JSON.stringify(actual)}`,
        );
      }
      if (!actual.includes(expected)) fail(expected);
    },
    toBeDefined(): void {
      if (actual === undefined) fail('anything but undefined');
    },
    toBeGreaterThan(expected: number): void {
      if (typeof actual !== 'number' || !(actual > expected)) {
        fail(`a number greater than ${expected}`);
      }
    },
    // The twin, added for a guard that has to bound a delta from ABOVE: a gap wider than N means a
    // directive stopped matching (`angular-directive-cost.itest.ts`). Inverting such a bound through
    // `toBeGreaterThan` costs the failure message its numbers, which is the whole value of having it.
    toBeLessThan(expected: number): void {
      if (typeof actual !== 'number' || !(actual < expected)) {
        fail(`a number less than ${expected}`);
      }
    },
  };
}

/**
 * Run everything registered and print one line per case.
 *
 * Called at the END of a test file rather than by the harness, because there is no module loader
 * here to hook: evaluation of the bundle IS the lifecycle.
 */
export function report(): void {
  const results: string[] = [];
  const runtime: Record<string, unknown> = globalThis;
  runtime.__symbioteResults = results;
  runtime.__symbioteDone = false;

  let chain = Promise.resolve();
  for (const one of cases) {
    chain = chain.then(async () => {
      // An empty platform per case, so an assertion cannot be satisfied by what a previous test
      // left standing. The runtime is NOT reset: module state belongs to the file.
      __symbioteTester.reset();
      try {
        for (const hook of beforeEachHooks) await hook();
        await one.run();
        results.push(`PASS ${one.name}`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        results.push(`FAIL ${one.name} :: ${detail}`);
      }
      for (const hook of afterEachHooks) {
        try {
          await hook();
        } catch {
          // An afterEach that throws must not rewrite the verdict of the case it followed.
        }
      }
    });
  }

  // The binary reads the results after draining; it cannot await from C++. A case may be async —
  // most adapter tests are — so results are collected rather than printed as they happen.
  void chain.then(() => {
    runtime.__symbioteDone = true;
  });
}
