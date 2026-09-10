// The imperative five must reach the HOST, never the Fabric slot.
//
// A JSI handle carries exactly one `NativeState`. Under the native host that state is our `Node`, so
// `nativeFabricUIManager.measure` — which expects a `ShadowNode` reference — throws `Value state is
// nullptr` on the first `measure()` an app performs. Device-found 2026-09-08.
//
// It could not be found here, and that is the point of this file. The reference applier puts its
// FAKE FABRIC NODE in `ICommittedRecord.handle` while native puts the PLACEHOLDER, so calling the
// slot with `record.handle` worked headlessly and threw on a device — 5 526 tests green across the
// whole regression. What is assertable is the routing itself, and the argument: an imperative call
// hands the host the placeholder, and the host maps it to whatever its own side needs.
import { describe, expect, it, vi } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';

import {
  createElement,
  createSurface,
  dispatchViewCommand,
  measure,
  measureInWindow,
  sendAccessibilityEvent,
} from '../index';
import { setTreeHost, treeHost, type ITreeHost } from '../tree-host';

installFabric();
let nextRootTag = 9500;

function mounted() {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  surface.appendChild(node);
  surface.commit();
  return node;
}

/** Run `body` with the installed host's members spied on, then put the real one back. */
function withSpiedHost(
  body: (spies: Record<string, ReturnType<typeof vi.fn>>) => void,
) {
  const real = treeHost();
  if (real === undefined)
    throw new Error('no host installed — installFabric() did not run');
  const spies = {
    measure: vi.fn(),
    measureInWindow: vi.fn(),
    dispatchCommand: vi.fn(),
    sendAccessibilityEvent: vi.fn(),
  };
  const spied: ITreeHost = { ...real, ...spies };
  setTreeHost(spied);
  try {
    body(spies);
  } finally {
    setTreeHost(real);
  }
}

describe('an imperative call is routed to the tree host', () => {
  it('hands the host the PLACEHOLDER, not the committed Fabric handle', () => {
    const node = mounted();
    const callback = vi.fn();

    withSpiedHost(spies => {
      measure(node, callback);
      // The node itself. Passing `committedRecordOf(node).handle` is what threw on device, and it
      // would pass any assertion that only checked the call count.
      expect(spies.measure).toHaveBeenCalledWith(node, callback);
    });
  });

  it('routes the other members the same way', () => {
    const node = mounted();
    const callback = vi.fn();

    withSpiedHost(spies => {
      measureInWindow(node, callback);
      dispatchViewCommand(node, 'focus', [1]);
      sendAccessibilityEvent(node, 'focus');

      expect(spies.measureInWindow).toHaveBeenCalledWith(node, callback);
      expect(spies.dispatchCommand).toHaveBeenCalledWith(node, 'focus', [1]);
      expect(spies.sendAccessibilityEvent).toHaveBeenCalledWith(node, 'focus');
    });
  });

  it('stays silent for a node that has never committed', () => {
    // No surface, no commit — the ordinary state under an async-batched renderer, and the reason
    // every one of these guards on `committedRecordOf` before it calls anything.
    const node = createElement('RCTView');

    withSpiedHost(spies => {
      measure(node, vi.fn());
      expect(spies.measure).not.toHaveBeenCalled();
    });
  });
});
