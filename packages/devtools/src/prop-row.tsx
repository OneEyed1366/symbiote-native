// A single key-value props row, recursively expandable for nested plain objects/arrays — shared
// by every panel that shows a native node's props (currently native-tree-panel.tsx).
import {
  PANEL_BOOLEAN_COLOR,
  PANEL_MUTED_TEXT,
  PANEL_NUMBER_COLOR,
  PANEL_STRING_COLOR,
  PANEL_TEXT,
  ROW_HEIGHT,
  INDENT_WIDTH,
} from './panel-styles';

const OPAQUE_PLACEHOLDERS: ReadonlySet<string> = new Set([
  '[Function]',
  '[Object]',
  '[Symbol]',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExpandableValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return isPlainRecord(value) && Object.keys(value).length > 0;
}

function valuePreview(value: unknown): string {
  if (typeof value === 'string')
    return OPAQUE_PLACEHOLDERS.has(value) ? value : `"${value}"`;
  return String(value);
}

function valueColor(value: unknown): string {
  if (typeof value === 'string')
    return OPAQUE_PLACEHOLDERS.has(value)
      ? PANEL_MUTED_TEXT
      : PANEL_STRING_COLOR;
  if (typeof value === 'number') return PANEL_NUMBER_COLOR;
  if (typeof value === 'boolean') return PANEL_BOOLEAN_COLOR;
  return PANEL_MUTED_TEXT;
}

function collapsedSummary(value: unknown): string {
  return Array.isArray(value) ? `Array(${value.length})` : '{…}';
}

export function PropRow({
  path,
  label,
  value,
  depth,
  collapsedPaths,
  onToggle,
}: {
  path: string;
  label: string;
  value: unknown;
  depth: number;
  collapsedPaths: ReadonlySet<string>;
  onToggle: (path: string) => void;
}) {
  const isExpandable = isExpandableValue(value);
  const isCollapsed = collapsedPaths.has(path);
  const entries =
    isExpandable && !isCollapsed
      ? Object.entries(value as Record<string, unknown>)
      : [];

  return (
    <div>
      <div
        style={{
          paddingLeft: depth * INDENT_WIDTH,
          display: 'flex',
          gap: 8,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          lineHeight: `${ROW_HEIGHT}px`,
          whiteSpace: 'nowrap',
        }}
      >
        <span
          onClick={isExpandable ? () => onToggle(path) : undefined}
          style={{
            width: 10,
            cursor: isExpandable ? 'pointer' : 'default',
            color: PANEL_MUTED_TEXT,
            userSelect: 'none',
          }}
        >
          {isExpandable ? (isCollapsed ? '▸' : '▾') : ''}
        </span>
        <span style={{ color: PANEL_TEXT, minWidth: 120 }}>{label}</span>
        {isExpandable ? (
          isCollapsed && (
            <span style={{ color: PANEL_MUTED_TEXT }}>
              {collapsedSummary(value)}
            </span>
          )
        ) : (
          <span style={{ color: valueColor(value) }}>
            {valuePreview(value)}
          </span>
        )}
      </div>
      {entries.map(([key, item]) => (
        <PropRow
          key={key}
          path={`${path}.${key}`}
          label={key}
          value={item}
          depth={depth + 1}
          collapsedPaths={collapsedPaths}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
