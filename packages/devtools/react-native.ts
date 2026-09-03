// Rozenite DevTools app-side plugin entry — read the symbiote-devtools-inspector skill first
// for the full architecture and the resolved v0 scope.
//
// Importing this module wires the retained-tree inspector up; nothing here executes unless
// something explicitly imports it. This is a deliberate departure from rozenite.dev's
// plugin-development docs, which show a `react-native.ts` exporting
// `export default function setupPlugin(client: DevToolsPluginClient<...>) {...}`, implying the
// Rozenite framework discovers an installed plugin and calls that export automatically with a
// ready-made client. Verified against the ACTUAL installed package instead of trusting that
// prose: `@rozenite/plugin-bridge@2.1.0`'s own `dist/index.d.ts` exports neither a
// `DevToolsPluginClient` type nor any "framework calls your setup function" mechanism — its
// only client constructor is `getRozeniteDevToolsClient(pluginId): Promise<client>`, which any
// caller has to invoke itself. The one confirmed real-world precedent (the official Redux
// DevTools plugin, rozenite.dev/docs/official-plugins/redux-devtools) also wires up explicitly
// in the app's own code (`rozeniteDevToolsEnhancer()` called from the app's `store.ts`), not via
// silent auto-discovery. So this module self-invokes its setup on import, and the consuming app
// (examples/svelte's index.js) imports it explicitly behind the WITH_ROZENITE flag — see that
// file and its babel.config.js for the gate.
import { getRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import {
  dlog,
  getActiveSurfaces,
  isDebug,
  registerPostCommit,
} from '@symbiote-native/engine';
import {
  DEVTOOLS_PLUGIN_ID,
  type IDevtoolsEvents,
  type ISerializedSurface,
} from './src/protocol';
import { serializeSurfaceTree } from './src/serialize-tree';

function snapshotActiveSurfaces(): ISerializedSurface[] {
  return getActiveSurfaces().map(surface => ({
    rootTag: surface.rootTag,
    children: serializeSurfaceTree(surface.children),
  }));
}

// `registerPostCommit` fires on EVERY commit — during a scroll, an animation, or a navigation
// transition that can be many times per second. Serializing the whole tree and JSON-shipping it
// over the CDP bridge on every single one of those, uncapped, is what crashed the DevTools panel
// on a real device (memory exhaustion, confirmed — see serialize-tree.ts's MAX_SERIALIZED_NODES
// comment for the node-count half of this fix; this is the send-FREQUENCY half). A leading+
// trailing throttle: the first commit in a burst is reflected immediately (no perceived lag
// opening the panel mid-interaction), and at most one MORE snapshot follows once the burst
// settles — always the CURRENT tree at whichever moment `fn` actually runs, never a stale one
// captured earlier, since `fn` reads live state each time it's called.
const SNAPSHOT_THROTTLE_MS = 250;

export function createTrailingThrottle(
  fn: () => void,
  intervalMs: number,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hasPendingCall = false;

  function armTimer(): void {
    timer = setTimeout(() => {
      timer = undefined;
      if (hasPendingCall) {
        hasPendingCall = false;
        fn();
        armTimer();
      }
    }, intervalMs);
  }

  return () => {
    if (timer === undefined) {
      fn();
      armTimer();
    } else {
      hasPendingCall = true;
    }
  };
}

async function setupDevtoolsInspector(): Promise<void> {
  dlog('devtools inspector: connecting…');
  const client =
    await getRozeniteDevToolsClient<IDevtoolsEvents>(DEVTOOLS_PLUGIN_ID);
  dlog('devtools inspector: client connected, awaiting subscribe');

  let isSubscribed = false;
  // core/engine/src/post-commit.ts's registerPostCommit has no matching "unregister" — it's a
  // plain Set that only ever grows. Register this hook AT MOST ONCE per app lifetime and gate
  // its actual work behind `isSubscribed` instead, so repeated subscribe/unsubscribe cycles
  // from the panel never add a second entry (which would double-send every future snapshot).
  let hookRegistered = false;

  const sendSnapshotIfSubscribed = () => {
    if (!isSubscribed) return;
    const surfaces = snapshotActiveSurfaces();
    dlog(
      () =>
        `devtools inspector: sending snapshot, ${surfaces.length} surface(s)`,
    );
    client.send('snapshot', surfaces);
  };
  // Throttled for the per-commit stream (registerPostCommit, below) — NOT for the subscribe-time
  // call further down, which stays immediate so opening the panel shows the current tree right
  // away rather than waiting out the throttle window.
  const throttledSendSnapshot = createTrailingThrottle(
    sendSnapshotIfSubscribed,
    SNAPSHOT_THROTTLE_MS,
  );

  client.onMessage('subscribe', () => {
    dlog('devtools inspector: subscribe received');
    isSubscribed = true;
    if (!hookRegistered) {
      hookRegistered = true;
      registerPostCommit(throttledSendSnapshot);
    }
    // A developer opening the panel should see the current tree immediately, not wait for the
    // next commit.
    sendSnapshotIfSubscribed();
  });

  client.onMessage('unsubscribe', () => {
    dlog('devtools inspector: unsubscribe received');
    isSubscribed = false;
  });
}

void setupDevtoolsInspector().catch((error: unknown) => {
  if (isDebug()) dlog(`devtools inspector: setup failed — ${String(error)}`);
});
