// svelte-adapter-dom-shim skill §16: Svelte trims only the leading/trailing whitespace of a
// fragment's own children - never whitespace INSIDE a single Text node, and never a
// whitespace-only Text node BETWEEN two siblings. Vue's compiler (and every browser) collapses
// both; Svelte doesn't. Confirmed against the real compiler (2026-08-17): a Text node authored
// as `Hello world, this is a\n  long sentence.` compiles verbatim into
// `$.text('Hello world, this is a\n  long sentence.')` - the newline and indent ship into the
// native text content and render as a forced line break plus stray leading spaces on device.
// Reproduced live on an iOS simulator before this file existed; fixed with it registered.
//
// Two hazards:
//   1. Wrapped sentence - a Text node with real content plus an embedded whitespace run
//      (usually a line-wrap for readability). Fixed by collapsing every whitespace run to a
//      single space, matching HTML/Vue.
//   2. Stray sibling gap - a Text node that is entirely whitespace. Compiles to a real
//      `$.text(' ')` -> ShimText -> RCTRawText engine node: invalid outside a Text-accepting
//      parent, and a stray paint even inside one. Fixed by deleting the node outright, since
//      collapsing alone leaves it there as a single space.
//
// Telling an accidental gap from an intentional inline space (`<Text>{a} {b}</Text>`) needs a
// signal, since both are whitespace-only nodes: did the original contain a newline? A same-line
// space is something the author typed on purpose; a run spanning multiple source lines has, in
// every case this codebase has produced, come from writing each sibling on its own line. So only
// a whitespace-only node with a newline gets deleted; a same-line run of 2+ spaces collapses to
// one and stays, matching HTML's own collapse of an intentional double space.
//
// Hazard 2 is no longer THIS file's guarantee. A whitespace-only run between two siblings on
// ONE line (`<View><A/>  <B/></View>`) is indistinguishable here from an intentional space -
// the missing fact is whether the parent renders raw text, which source alone cannot say.
// `dom-shim/text.ts` knows it: by the time a text node goes live its parent's engine node is
// bound, so it drops whitespace-only text under any non-text parent. That is exact, and it
// holds even for a consumer who never registers this preprocessor.
//
// So deleting the cross-line gap here is now an OPTIMIZATION - the node is never built at all -
// plus source hygiene for svelte-check. Hazard 1 (a wrapped sentence INSIDE one text node) does
// still rely on this file: it needs collapsing rather than dropping, and only source can tell an
// authored newline from one a runtime value carries. `scripts/audit-svelte-stray-whitespace.mjs`
// still walks compiled output independently of both.
//
// Registered in svelte.config.js's `preprocess`, same as forbid-web-only-constructs.ts and
// scoped-styles.ts, so it covers both svelte-check/the language server and Metro's build.
//
// Line numbers are not preserved past an edited node, unlike scoped-styles.ts's blankOut trick:
// blankOut hides removed characters behind an equal count of `\n` because that code is gone from
// the output entirely; here the newlines being removed are the bug, so re-inserting them
// anywhere would bring it back. A diagnostic below an edited node may point a few lines off - no
// source map, matching the other two preprocessors, and the one place that choice costs
// something.

import { parse } from 'svelte/compiler';

interface IEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface IMarkupInput {
  readonly content: string;
  readonly filename?: string;
}

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

// Same walk shape as scoped-styles.ts's collectClassEdits: a Text node can sit inside an
// {#if}/{#each} branch, a snippet body, or an element's children, so this descends through every
// child value rather than one known key.
function nestedNodes(node: Record<string, unknown>): unknown[] {
  const nested: unknown[] = [];
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) nested.push(...value);
    else if (isRecord(value)) nested.push(value);
  }
  return nested;
}

// Narrower than the shim's WHITESPACE_ONLY, on purpose - do NOT "unify" them. This class drives
// COLLAPSING runs inside real text content, where `&nbsp;` / `&emsp;` are a deliberate character
// an author typed, not formatting; folding them into a plain space would change what renders.
// The shim can be wider because it only ever DROPS, and only under a parent that cannot paint
// text at all. Same reason Svelte's own regex_not_whitespace excludes nbsp.
const WHITESPACE_RUN = /[ \t\r\n]+/g;

function collectEdits(nodes: unknown[], edits: IEdit[]): void {
  for (const node of nodes) {
    if (!isRecord(node)) continue;
    if (node.type === 'Text') {
      const start = numberAt(node, 'start');
      const end = numberAt(node, 'end');
      const data = stringAt(node, 'data');
      if (start !== undefined && end !== undefined && data !== undefined) {
        const edit = textEdit(start, end, data);
        if (edit !== undefined) edits.push(edit);
      }
      continue;
    }
    collectEdits(nestedNodes(node), edits);
  }
}

function textEdit(start: number, end: number, data: string): IEdit | undefined {
  if (!WHITESPACE_RUN.test(data)) return undefined; // fast path: nothing to collapse
  WHITESPACE_RUN.lastIndex = 0;
  const collapsed = data.replace(WHITESPACE_RUN, ' ');
  if (collapsed.trim() === '') {
    // Whitespace-only node: delete it only if the original spanned a line break, else leave it
    // as the single collapsed space.
    return data.includes('\n')
      ? { start, end, text: '' }
      : { start, end, text: collapsed };
  }
  if (collapsed === data) return undefined;
  return { start, end, text: collapsed };
}

// Applied back-to-front so an earlier edit's offsets stay valid, same as scoped-styles.ts.
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
