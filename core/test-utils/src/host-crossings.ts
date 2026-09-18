/**
 * How many times JS asked the installed tree host a question, since the last reset.
 *
 * Generic over any `ITreeHost` — `installFabric()`'s own `applierWalk.hostCrossings` did the same
 * counting, but wrapped only its OWN mirror host, so a file measuring "does the dispatch code cross
 * the host once per event, not once per ancestor" had no port to `installRecordingFabric()`. The
 * subject here is a JS-SIDE call pattern (how many times the engine's dispatch code reaches across
 * the host boundary), not anything about what Fabric does with the call — so it needs no committed
 * tree and no clone protocol, only a host whose methods can be counted, which any `ITreeHost` is.
 *
 * `applyOps` is excluded from the count, matching the mirror's own convention: it is the mutation
 * batch a commit carries, not a "question", and counting it would conflate two different budgets.
 */

import type { ITreeHost } from '@symbiote-native/engine';

// The mirror's own `countingHost` (tree-applier.ts) can safely `Object.keys()` its host, because
// the object it wraps carries ONLY these members. `installRecordingFabric()`'s host does not: it is
// simultaneously the installed `ITreeHost` AND the test-facing API (`fireEvent`, `reset`, `commands`,
// `find`…), all on one object, so `Object.keys` would ALSO wrap and count `fireEvent` itself —
// measured: a 20-event budget that should read 1 crossing/event read 2, because firing the event was
// one counted call before the dispatch code's own `ancestorsOf` added the second. Listed explicitly,
// matching `ITreeHost` in tree-host.ts — keep the two in sync if that interface gains a member.
const TREE_HOST_METHOD_NAMES = [
  'applyOps',
  'propOf',
  'propsOf',
  'markPropsDirty',
  'committedRecordOf',
  'parentOf',
  'childrenOf',
  'nextSiblingOf',
  'parentsOf',
  'subtreesOf',
  'ancestorsOf',
  'census',
  'dispatchCommand',
  'sendAccessibilityEvent',
  'measure',
  'measureInWindow',
  'measureLayout',
  'setIsJSResponder',
] as const;

export type IHostCrossingTracker = {
  /** Calls into the tracked host's methods (excluding `applyOps`) since the last `reset()`. */
  crossings: number;
  reset(): void;
};

/** Wraps `host`'s own methods IN PLACE, so whatever holds `host` (e.g. `setTreeHost`) sees the count. */
export function trackHostCrossings(host: ITreeHost): IHostCrossingTracker {
  const tracker: IHostCrossingTracker = {
    crossings: 0,
    reset(): void {
      tracker.crossings = 0;
    },
  };
  for (const name of TREE_HOST_METHOD_NAMES) {
    if (name === 'applyOps') continue;
    const member: unknown = Reflect.get(host, name);
    if (typeof member !== 'function') continue;
    Reflect.set(host, name, (...args: unknown[]): unknown => {
      tracker.crossings += 1;
      return Reflect.apply(member, host, args);
    });
  }
  return tracker;
}
