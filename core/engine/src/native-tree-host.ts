// The NATIVE tree host — `INativeEngineBindings` presented as an `ITreeHost`. It is the half that
// makes the buffer mean anything on a device: `tree-host.ts` records ops and asks a host to turn
// them into a tree; headlessly, `installFabric()` installs the TS applier instead.

// No logic here on purpose: everything the host is asked is something native already answers, so
// this stays a rename plus an argument spread, thin enough to audit against native's own side.

import { nativeEngine, type INativeEngineBindings } from './native-engine';
import {
  EMPTY_CENSUS,
  setTreeHost,
  treeHost,
  type ITreeHost,
} from './tree-host';

// Present one resolved set of bindings as the engine's tree host.

// `census` is the only member that never reaches native — deliberately not on the ABI, since its
// one caller (censusRetainedTree) is diagnostics and answering honestly costs a full native walk
// of the tree the design exists to avoid walking. The empty census matches the no-host answer.
export function nativeTreeHost(bindings: INativeEngineBindings): ITreeHost {
  return {
    // Spread rather than passed as the batch object: JSI reads five arguments cheaper than five
    // properties, and this is the one member on a commit path.
    applyOps: batch =>
      bindings.applyOps(
        batch.ops,
        batch.strings,
        batch.values,
        batch.instanceHandles,
        batch.handles,
      ),
    propOf: bindings.getProp,
    propsOf: bindings.getProps,
    markPropsDirty: bindings.markPropsDirty,
    committedRecordOf: bindings.committedRecordOf,
    committedPayloadOf: bindings.committedPayloadOf,
    parentOf: bindings.parentOf,
    childrenOf: bindings.childrenOf,
    firstChildOf: bindings.firstChildOf,
    nextSiblingOf: bindings.nextSiblingOf,
    parentsOf: bindings.parentsOf,
    subtreesOf: bindings.subtreesOf,
    teardownSubtreesOf: bindings.teardownSubtreesOf,
    ancestorsOf: bindings.ancestorsOf,
    census: () => EMPTY_CENSUS,
    // Straight through: native already takes the placeholder, which is what `committedRecordOf`
    // above hands back in its `handle` field for exactly this reason.
    dispatchCommand: bindings.dispatchCommand,
    sendAccessibilityEvent: bindings.sendAccessibilityEvent,
    measure: bindings.measure,
    measureInWindow: bindings.measureInWindow,
    measureLayout: bindings.measureLayout,
    setIsJSResponder: bindings.setIsJSResponder,
  };
}

// Install it, if this runtime has a native module and nothing has claimed the seam already.

// An installed host wins: installFabric() (the only other setTreeHost caller) puts the TS applier
// in first, so a headless run carrying fake bindings must keep the applier, not the stub.

// No native module is the ordinary answer (see native-engine.ts); ops then simply keep
// accumulating, undelivered.
export function installNativeTreeHost(): void {
  const bindings = nativeEngine();
  if (bindings === undefined || treeHost() !== undefined) return;
  setTreeHost(nativeTreeHost(bindings));
}
