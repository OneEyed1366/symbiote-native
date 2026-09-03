// Shared color/sizing tokens for every panel in this plugin. React Native DevTools renders a
// panel's iframe against its own dark theme; without an explicit color the browser default
// (near-black) text was landing on that same near-black background — readable in neither theme,
// since we never actually know which one is live.
export const PANEL_BACKGROUND = '#1e1e1e';
export const PANEL_TEXT = '#d4d4d4';
export const PANEL_MUTED_TEXT = '#8a8a8a';
export const PANEL_BORDER = '#3c3c3c';
export const PANEL_SELECTED_BACKGROUND = 'rgba(96, 165, 250, 0.25)';
export const PANEL_COMPONENT_TEXT = '#4fc1ff';
export const PANEL_STRING_COLOR = '#ce9178';
export const PANEL_NUMBER_COLOR = '#b5cea8';
export const PANEL_BOOLEAN_COLOR = '#569cd6';
// For a `truncatedChildCount` indicator (serialize-tree.ts) — a visible marker that a node's
// children were cut by the panel's payload-size cap, never a silent gap.
export const PANEL_WARNING_COLOR = '#d7ba7d';

export const ROW_HEIGHT = 20;
export const INDENT_WIDTH = 16;
