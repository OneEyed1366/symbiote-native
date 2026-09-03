// The "Native Tree" panel — the raw retained native tree (RCTView/RCTText/RCTRawText), exactly
// what actually got painted, with no notion of which developer component created what. This is
// the browser-DevTools "Elements" twin: a layout/structure debugging tool, deliberately separate
// from components-panel.tsx's "which component did I write" job — see the symbiote-devtools-
// inspector skill for why these are two panels, not one hybrid view (a hybrid was tried first and
// read as noise on a real device: everything looked native regardless of ownership).
import { useMemo, useState } from 'react';
import {
  PANEL_BACKGROUND,
  PANEL_BORDER,
  PANEL_MUTED_TEXT,
  PANEL_SELECTED_BACKGROUND,
  PANEL_TEXT,
  PANEL_WARNING_COLOR,
  ROW_HEIGHT,
  INDENT_WIDTH,
} from './panel-styles';
import { PropRow } from './prop-row';
import { useDevtoolsSnapshot } from './use-snapshot';
import type { ISerializedNode } from './protocol';

// An explicit work stack, not recursion — a deeply-nested-navigator screen's native tree runs
// hundreds of levels deep (see components-panel.tsx's identical fix, which is what surfaced this
// on a real device), and this is the same class of risk over the same data.
function flattenNodesById(
  nodes: readonly ISerializedNode[],
  into: Map<number, ISerializedNode>,
): void {
  const stack: ISerializedNode[] = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    into.set(node.id, node);
    stack.push(...node.children);
  }
}

function nodeLabel(node: ISerializedNode): string {
  return node.isText && node.textPreview !== undefined
    ? `"${node.textPreview}"`
    : node.component;
}

function TreeNode({
  node,
  depth,
  collapsedIds,
  onToggleCollapse,
  selectedId,
  onSelect,
}: {
  node: ISerializedNode;
  depth: number;
  collapsedIds: ReadonlySet<number>;
  onToggleCollapse: (id: number) => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedIds.has(node.id);

  return (
    <div>
      <div
        onClick={() => onSelect(node.id)}
        style={{
          display: 'flex',
          gap: 4,
          paddingLeft: depth * INDENT_WIDTH,
          cursor: 'pointer',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          lineHeight: `${ROW_HEIGHT}px`,
          whiteSpace: 'nowrap',
          color: PANEL_TEXT,
          background:
            node.id === selectedId ? PANEL_SELECTED_BACKGROUND : 'transparent',
        }}
      >
        <span
          onClick={
            hasChildren
              ? event => {
                  event.stopPropagation();
                  onToggleCollapse(node.id);
                }
              : undefined
          }
          style={{ width: 10, color: PANEL_MUTED_TEXT, userSelect: 'none' }}
        >
          {hasChildren ? (isCollapsed ? '▸' : '▾') : ''}
        </span>
        {nodeLabel(node)}
      </div>
      {!isCollapsed && node.truncatedChildCount !== undefined && (
        <div
          style={{
            paddingLeft: (depth + 1) * INDENT_WIDTH,
            fontFamily: 'ui-monospace, monospace',
            fontSize: 12,
            lineHeight: `${ROW_HEIGHT}px`,
            color: PANEL_WARNING_COLOR,
          }}
        >
          ⚠ {node.truncatedChildCount} more truncated — payload size limit
        </div>
      )}
      {!isCollapsed &&
        node.children.map(child => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            collapsedIds={collapsedIds}
            onToggleCollapse={onToggleCollapse}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

export default function NativeTreePanel() {
  const { client, surfaces } = useDevtoolsSnapshot();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [collapsedPropPaths, setCollapsedPropPaths] = useState<
    ReadonlySet<string>
  >(() => new Set());

  const nodesById = useMemo(() => {
    const map = new Map<number, ISerializedNode>();
    for (const surface of surfaces) flattenNodesById(surface.children, map);
    return map;
  }, [surfaces]);

  const selectedNode =
    selectedId === null ? null : (nodesById.get(selectedId) ?? null);

  function toggleCollapse(id: number): void {
    setCollapsedIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePropPath(path: string): void {
    setCollapsedPropPaths(previous => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

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
        style={{
          flex: 1,
          overflow: 'auto',
          borderRight: `1px solid ${PANEL_BORDER}`,
          padding: 8,
        }}
      >
        {surfaces.length === 0 && (
          <div style={{ color: PANEL_MUTED_TEXT }}>No active surfaces yet.</div>
        )}
        {surfaces.map(surface => (
          <div key={surface.rootTag}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 12,
                margin: '4px 0',
                color: PANEL_TEXT,
              }}
            >
              Surface #{surface.rootTag}
            </div>
            {surface.children.map(node => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                collapsedIds={collapsedIds}
                onToggleCollapse={toggleCollapse}
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
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {nodeLabel(selectedNode)}
            </div>
            <div
              style={{ color: PANEL_MUTED_TEXT, fontSize: 11, marginBottom: 8 }}
            >
              #{selectedNode.id} · {selectedNode.children.length} children
            </div>
            {Object.entries(selectedNode.props).map(([key, value]) => (
              <PropRow
                key={key}
                path={key}
                label={key}
                value={value}
                depth={0}
                collapsedPaths={collapsedPropPaths}
                onToggle={togglePropPath}
              />
            ))}
          </div>
        ) : (
          <div style={{ color: PANEL_MUTED_TEXT }}>
            Select a node to inspect its props.
          </div>
        )}
      </div>
    </div>
  );
}
