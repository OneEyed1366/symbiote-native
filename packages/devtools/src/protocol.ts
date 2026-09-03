// Shared, runtime-neutral message shapes between the app-side plugin entry (react-native.ts,
// which imports @symbiote-native/engine) and the browser panel (tree-inspector-panel.tsx, a
// plain React-DOM bundle built separately by @rozenite/vite-plugin). Deliberately zero imports
// from @symbiote-native/engine here — the panel bundle must never pull in RN-only code, only
// these plain structural types, which is why they live in their own file instead of next to
// serialize-tree.ts.

// Must match this package's `name` in package.json — the panel's `useRozeniteDevToolsClient`
// and the app's `getRozeniteDevToolsClient` both key off it to find each other.
export const DEVTOOLS_PLUGIN_ID = 'symbiote-devtools-inspector';

export type ISerializedNode = {
  id: number;
  component: string;
  isText: boolean;
  props: Record<string, unknown>;
  // Only present for a raw-text node (RCTRawText) — see serialize-tree.ts's getTextPreview.
  textPreview?: string;
  // The developer-authored component ancestry that led to this node (root-first — [App,
  // CanaryScreen, Button] — not just the nearest creator), when the owning adapter was able to
  // determine it — see ISymbioteNodeOwner in @symbiote-native/engine. Absent for a node no
  // adapter has tagged yet.
  owner?: { chain: readonly { component: string; file?: string }[] };
  children: ISerializedNode[];
  // Present when this node had MORE native children than the serializer's total-node budget
  // allowed for (see MAX_SERIALIZED_NODES in serialize-tree.ts) — the count of children that got
  // cut, never silently. A deeply-nested-navigator screen can retain tens of thousands of native
  // nodes; serializing and shipping ALL of them as JSON on every commit is what crashed the panel
  // on a real device (memory, not a stack-depth issue — see the symbiote-devtools-inspector skill).
  truncatedChildCount?: number;
};

export type ISerializedSurface = {
  rootTag: number;
  children: ISerializedNode[];
};

// A `type` alias, not an `interface` — RozeniteDevToolsClient<TEventMap> constrains TEventMap
// to `Record<string, unknown>`, and an interface with no index signature fails that generic
// constraint check even though it's structurally compatible.
export type IDevtoolsEvents = {
  // `null`, never `undefined` — @rozenite/middleware relays a message to the device via
  // `JSON.stringify` inside a CDP `Runtime.evaluate` expression (host.js's
  // RozeniteBindingsModel.sendMessage), and JSON.stringify DROPS a key whose value is
  // `undefined` entirely. @rozenite/plugin-bridge's own receive-side validator requires the
  // `payload` key to literally be present (`"payload" in message`), so a message built with
  // `payload: undefined` arrives on the device as `{pluginId, type}` — no `payload` key at all —
  // and gets silently rejected before ever reaching an `onMessage` handler. Measured 2026-08-16
  // by bypassing plugin-bridge and reading the raw CDP domain directly: the message DID reach
  // the device (proving the transport was never the problem), just missing its `payload` key.
  subscribe: null;
  unsubscribe: null;
  snapshot: ISerializedSurface[];
};
