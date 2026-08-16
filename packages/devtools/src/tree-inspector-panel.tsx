// The DevTools panel itself — plain React DOM rendered inside a browser iframe by React Native
// DevTools (Rozenite), NOT rendered through our own engine/renderer. v0 scope only: a tree view
// + a props panel for whatever node is selected. No search, no hover-highlight (see the
// symbiote-devtools-inspector skill for what's deferred and why).
import { useEffect, useMemo, useState } from 'react';
import { useRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import {
  DEVTOOLS_PLUGIN_ID,
  type IDevtoolsEvents,
  type ISerializedNode,
  type ISerializedSurface,
} from './protocol';

function flattenNodesById(
  nodes: readonly ISerializedNode[],
  into: Map<number, ISerializedNode>,
): void {
  for (const node of nodes) {
    into.set(node.id, node);
    flattenNodesById(node.children, into);
  }
}

function nodeLabel(node: ISerializedNode): string {
  return node.isText && node.textPreview !== undefined ? `"${node.textPreview}"` : node.component;
}

// React Native DevTools renders this panel's iframe against its own dark theme; without an
// explicit color the browser default (near-black) text was landing on that same near-black
// background — readable in neither theme, since we never actually know which one is live.
const PANEL_BACKGROUND = '#1e1e1e';
const PANEL_TEXT = '#d4d4d4';
const PANEL_MUTED_TEXT = '#8a8a8a';
const PANEL_BORDER = '#3c3c3c';
const PANEL_SELECTED_BACKGROUND = 'rgba(96, 165, 250, 0.25)';

function TreeNode({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: ISerializedNode;
  depth: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div>
      <div
        onClick={() => onSelect(node.id)}
        style={{
          paddingLeft: depth * 16,
          cursor: 'pointer',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          lineHeight: '20px',
          whiteSpace: 'nowrap',
          color: PANEL_TEXT,
          background: node.id === selectedId ? PANEL_SELECTED_BACKGROUND : 'transparent',
        }}
      >
        {nodeLabel(node)}
      </div>
      {node.children.map(child => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export default function TreeInspectorPanel() {
  const client = useRozeniteDevToolsClient<IDevtoolsEvents>({ pluginId: DEVTOOLS_PLUGIN_ID });
  const [surfaces, setSurfaces] = useState<ISerializedSurface[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!client) return;

    client.send('subscribe', null);
    const subscription = client.onMessage('snapshot', setSurfaces);

    return () => {
      subscription.remove();
      client.send('unsubscribe', null);
    };
  }, [client]);

  // Selection is pure client-side state — the full snapshot already carries every node's
  // props, so picking a node never needs a round trip back to the app.
  const nodesById = useMemo(() => {
    const map = new Map<number, ISerializedNode>();
    for (const surface of surfaces) flattenNodesById(surface.children, map);
    return map;
  }, [surfaces]);

  const selectedNode = selectedId === null ? null : (nodesById.get(selectedId) ?? null);

  if (!client) {
    return (
      <div
        style={{
          padding: 16,
          fontFamily: 'sans-serif',
          background: PANEL_BACKGROUND,
          color: PANEL_TEXT,
        }}
      >
        Connecting to SymbioteNative…
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        fontFamily: 'sans-serif',
        background: PANEL_BACKGROUND,
      }}
    >
      <div
        style={{ flex: 1, overflow: 'auto', borderRight: `1px solid ${PANEL_BORDER}`, padding: 8 }}
      >
        {surfaces.length === 0 && (
          <div style={{ color: PANEL_MUTED_TEXT }}>No active surfaces yet.</div>
        )}
        {surfaces.map(surface => (
          <div key={surface.rootTag}>
            <div style={{ fontWeight: 600, fontSize: 12, margin: '4px 0', color: PANEL_TEXT }}>
              Surface #{surface.rootTag}
            </div>
            {surface.children.map(node => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 8, color: PANEL_TEXT }}>
        {selectedNode ? (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{selectedNode.component}</div>
            <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(selectedNode.props, null, 2)}
            </pre>
          </div>
        ) : (
          <div style={{ color: PANEL_MUTED_TEXT }}>Select a node to inspect its props.</div>
        )}
      </div>
    </div>
  );
}
