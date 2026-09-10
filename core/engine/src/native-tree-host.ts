// The NATIVE tree host — `INativeEngineBindings` presented as an `ITreeHost`.
//
// It is the half that makes the buffer mean anything on a device. `tree-host.ts` records ops and
// then asks a host to turn them into a tree; headlessly `installFabric()` installs the TypeScript
// applier, and until this file existed a device installed NOTHING — `commitSurfaceOps` returned
// early, the ops stayed pending forever, and the screen stayed blank with nothing red anywhere.
//
// There is no logic here on purpose. Everything the host is asked is something native already
// answers, so this is a rename and an argument spread; a mapping thin enough to read in one pass is
// what keeps the two sides auditable against each other.

import { nativeEngine, type INativeEngineBindings } from './native-engine';
import {
  EMPTY_CENSUS,
  setTreeHost,
  treeHost,
  type ITreeHost,
} from './tree-host';

/**
 * Present one resolved set of bindings as the engine's tree host.
 *
 * `census` is the only member that does not reach native, and it is deliberately not on the ABI: it
 * has exactly ONE engine caller (`censusRetainedTree`), it is diagnostics, and answering it honestly
 * would cost a full native walk of the very tree the design exists to stop walking. The empty census
 * is what `censusRetainedTree` already answers with no host at all, so a probe reading it sees the
 * same zeroes it has always seen off a device.
 */
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
    committedRecordOf: bindings.committedRecordOf,
    parentOf: bindings.parentOf,
    childrenOf: bindings.childrenOf,
    census: () => EMPTY_CENSUS,
    // Straight through: native already takes the placeholder, which is what `committedRecordOf`
    // above hands back in its `handle` field for exactly this reason.
    dispatchCommand: bindings.dispatchCommand,
    sendAccessibilityEvent: bindings.sendAccessibilityEvent,
    measure: bindings.measure,
    measureInWindow: bindings.measureInWindow,
    measureLayout: bindings.measureLayout,
  };
}

/**
 * Install it, if this runtime has a native module and nothing has claimed the seam already.
 *
 * PRECEDENCE: an installed host WINS. `installFabric()` is the only other caller of `setTreeHost`,
 * and it puts the TypeScript applier in before any fixture can bind a slot — so a headless run that
 * also happens to carry fake bindings must keep the applier, or the ~5 500 tests written against it
 * would silently start driving a stub. The reverse ordering cannot occur on a device: nothing there
 * installs a host but this.
 *
 * No native module is the ORDINARY answer (`native-engine.ts`'s header lists where), and it stays a
 * quiet one here: the ops simply keep accumulating, exactly as they did before this file existed.
 */
export function installNativeTreeHost(): void {
  const bindings = nativeEngine();
  if (bindings === undefined || treeHost() !== undefined) return;
  setTreeHost(nativeTreeHost(bindings));
}
