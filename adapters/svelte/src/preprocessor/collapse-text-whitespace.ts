// Svelte trims only the edges of a fragment, so a Text node keeps its inner newlines and indent
// Vue's compiler and every browser collapse them, here they would ship into native text

// A whitespace run inside real content collapses to one space, a same-line space stays as typed
// A whitespace-only node is deleted only when the original spanned a newline

// A gap between siblings on one line is handled at runtime, where the parent is known
// `blankFormattingWhitespace` in `symbiote-renderer.ts` blanks it under any parent but `<Text>`
// So deleting the gap here is an optimization, while a wrapped sentence still needs this file

// Registered in `svelte.config.js` like scoped-styles.ts, for svelte-check and Metro
// Line numbers drift past an edited node, as the removed newlines are the bug and there is no map

import { parse } from 'svelte/compiler';

const TEXT_NODE_TYPE = 'Text';

type IEdit = {
  readonly start: number;
  readonly end: number;
  readonly text: string;
};

type IMarkupInput = {
  readonly content: string;
  readonly filename?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function numberAt(
  node: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = node[key];
  return typeof value === 'number' ? value : undefined;
}

function stringAt(
  node: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = node[key];
  return typeof value === 'string' ? value : undefined;
}

function fragmentNodes(ast: unknown): unknown[] {
  if (!isRecord(ast)) return [];
  const fragment = ast.fragment;
  if (!isRecord(fragment)) return [];
  return Array.isArray(fragment.nodes) ? fragment.nodes : [];
}

// A Text node can sit in a branch, a snippet body or children, so the walk takes every child value
function nestedNodes(node: Record<string, unknown>): unknown[] {
  const nested: unknown[] = [];
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) nested.push(...value);
    else if (isRecord(value)) nested.push(value);
  }
  return nested;
}

// Narrower than the renderer's `isWhitespaceOnly` on purpose, do NOT unify them
// This one collapses runs inside real text, where `&nbsp;` is a character the author typed
const WHITESPACE_RUN = /[ \t\r\n]+/g;

function editOfTextNode(node: Record<string, unknown>): IEdit | undefined {
  const start = numberAt(node, 'start');
  const end = numberAt(node, 'end');
  const data = stringAt(node, 'data');
  if (start === undefined || end === undefined || data === undefined)
    return undefined;
  return textEdit(start, end, data);
}

function collectEdits(nodes: unknown[], edits: IEdit[]): void {
  for (const node of nodes) {
    if (!isRecord(node)) continue;
    if (node.type !== TEXT_NODE_TYPE) {
      collectEdits(nestedNodes(node), edits);
      continue;
    }
    const edit = editOfTextNode(node);
    if (edit !== undefined) edits.push(edit);
  }
}

function textEdit(start: number, end: number, data: string): IEdit | undefined {
  if (!WHITESPACE_RUN.test(data)) return undefined; // fast path: nothing to collapse
  WHITESPACE_RUN.lastIndex = 0;
  const collapsed = data.replace(WHITESPACE_RUN, ' ');
  if (collapsed.trim() === '') {
    // Whitespace-only node: delete it only if the original spanned a line break
    return data.includes('\n')
      ? { start, end, text: '' }
      : { start, end, text: collapsed };
  }
  if (collapsed === data) return undefined;
  return { start, end, text: collapsed };
}

// Applied back-to-front so an earlier edit's offsets stay valid, same as scoped-styles.ts
function applyEdits(content: string, edits: IEdit[]): string {
  return [...edits]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (source, edit) =>
        source.slice(0, edit.start) + edit.text + source.slice(edit.end),
      content,
    );
}

export function collapseTextWhitespace(): {
  markup(input: IMarkupInput): { code: string };
} {
  return {
    markup({ content, filename }) {
      const ast: unknown = parse(content, { filename, modern: true });
      const edits: IEdit[] = [];
      collectEdits(fragmentNodes(ast), edits);
      if (edits.length === 0) return { code: content };
      return { code: applyEdits(content, edits) };
    },
  };
}
