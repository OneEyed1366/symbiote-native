// Lower `<View>` / `<Text>` to their intrinsic custom-element tags before svelte/compiler sees
// the file, so a primitive stops costing a Svelte COMPONENT BOUNDARY.
//
// Why it matters here is not the same currency as Vue's. Vue charges a component instance;
// Svelte charges ANCHOR NODES. Measured 2026-08-23 on the 1 000-row benchmark row: the retained
// tree held 23 006 nodes where every other adapter holds 9 001 — renderable 9 002 (identical) plus
// 14 004 anchors, of which 12 002 were Svelte block/component comments, i.e. 12 per row for 6
// component instances. Fabric saw the same 9000/8000 calls either way, so the native side was
// never the problem; the cost is 14 004 extra retained objects plus `renderableChildren`
// (core/engine/src/commit.ts) losing its fast path 6 002 times per commit, re-scanning and
// re-allocating a child array for every anchor-bearing parent. An A/B against the intrinsic tags,
// with both arms asserted to build the SAME 9 002 renderable nodes and the SAME 9 000 createNode
// calls, read 89.3 ms -> 47.5 ms and 14 004 -> 8 002 anchors. Headless sizes nothing (it has
// mis-sized three such changes in a row, in both directions) — the mechanism is what that number
// establishes.
//
// TWO HALVES OR NOTHING, the lesson Vue's twin paid for: the wrappers do real work, and lowering
// deletes them. `View.svelte` folds RN's `id` onto `nativeID`; `Text.svelte` applies RN's Text.js
// defaults through resolveTextProps. Both are reproduced BELOW, at compile time, which is strictly
// cheaper than any runtime seam because the whole attribute set is visible here. Drop either and
// the failure is device-only and silent — a clamped <Text> that clips mid-word instead of
// ellipsising.
//
// THE REFUSAL RULE IS THE SAFETY PROPERTY. An element is lowered only when every one of its
// attributes is a plain name/value pair this file can read. A `{...spread}`, a `bind:`, a `use:`,
// an `{@attach}` or any other directive means the attribute set is NOT fully visible (or the
// binding targets the component instance rather than the host), so the element stays a component
// and simply keeps today's behaviour. Refusing is always safe; guessing is not.

import { parse } from 'svelte/compiler';
// The lowering SPEC, shared with Vue's and Solid's transforms. Which primitives lower, what each
// folds, and the refusal categories are DATA now — this file owns only how Svelte's AST is read
// and how the lowered form is emitted, which is the half that genuinely differs (our custom-
// element codegen needs one `p={{…}}` bag where Vue and Solid keep individual bindings).
//
// It is a `.cjs` because its other consumers are Babel/Metro transforms that run before any TS
// exists; a hand-written `.d.cts` beside it is what lets this file read it through real types.
import { HOST_PRIMITIVES } from '@symbiote-native/components/host-primitives';
import type {
  IFoldOp,
  IHostPrimitive,
} from '@symbiote-native/components/host-primitives';

const PACKAGE_IMPORT =
  /import\s*\{([^}]*)\}\s*from\s*['"]@symbiote-native\/svelte['"]/g;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// The runtime half of the state-style split, and the local name it is injected under. A sentinel
// KEY carries the spread through the same entry map every other attribute uses, so the fold and
// alias passes need no special case; only the serializer knows the difference.
const STATE_STYLE_MODULE = '@symbiote-native/svelte/state-style';
const STATE_STYLE_LOCAL = '__symbioteStateStyle';
const STATE_STYLE_SPREAD = '\u0000state-style-spread';

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

// Which LOCAL names in this file are our primitives. Only names this file imported from
// `@symbiote-native/svelte` count — matching a bare tag name would rewrite an app's own
// `<View>`. An alias (`View as Box`) maps the alias, since that is the name the markup uses.
function lowerableTagsIn(content: string): Map<string, IHostPrimitive> {
  const tags = new Map<string, IHostPrimitive>();
  for (const match of content.matchAll(PACKAGE_IMPORT)) {
    for (const clause of match[1].split(',')) {
      const [imported, local] = clause.trim().split(/\s+as\s+/);
      const primitive = HOST_PRIMITIVES[imported];
      if (primitive !== undefined) tags.set(local ?? imported, primitive);
    }
  }
  return tags;
}

function nestedNodes(node: Record<string, unknown>): unknown[] {
  const nested: unknown[] = [];
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) nested.push(...value);
    else if (isRecord(value)) nested.push(value);
  }
  return nested;
}

function slice(content: string, node: Record<string, unknown>): string {
  const start = numberAt(node, 'start');
  const end = numberAt(node, 'end');
  if (start === undefined || end === undefined) return '';
  return content.slice(start, end);
}

// One attribute -> the JS expression its bag value should hold, or undefined to REFUSE the whole
// element. Refusing on anything unrecognised is deliberate: a value shape this file cannot read
// is a value shape it cannot preserve.
function attributeValue(
  content: string,
  attribute: Record<string, unknown>,
): string | undefined {
  const value = attribute.value;
  // `<View focusable>` — boolean shorthand.
  if (value === true) return 'true';
  const parts = Array.isArray(value) ? value : [value];
  if (parts.length === 0) return 'true';
  if (parts.length === 1) {
    const only = parts[0];
    if (!isRecord(only)) return undefined;
    // `class="row"` — a literal. JSON.stringify, not the raw source slice: the slice carries the
    // author's quote style and any HTML entity, and the bag needs a JS string.
    if (only.type === 'Text') {
      const data = stringAt(only, 'data');
      return data === undefined ? undefined : JSON.stringify(data);
    }
    // `onPress={fn}` — parenthesised so a sequence or arrow keeps its meaning inside the literal.
    if (only.type === 'ExpressionTag') {
      const expression = only.expression;
      if (!isRecord(expression)) return undefined;
      return `(${slice(content, expression)})`;
    }
    return undefined;
  }
  // `class="a {b} c"` — a quoted value mixing literals and expressions becomes a template literal,
  // which is what the browser/Svelte concatenation produces anyway.
  const chunks: string[] = [];
  for (const part of parts) {
    if (!isRecord(part)) return undefined;
    if (part.type === 'Text') {
      const data = stringAt(part, 'data');
      if (data === undefined) return undefined;
      chunks.push(
        data
          .replaceAll('\\', '\\\\')
          .replaceAll('`', '\\`')
          .replaceAll('${', '\\${'),
      );
      continue;
    }
    if (part.type === 'ExpressionTag') {
      const expression = part.expression;
      if (!isRecord(expression)) return undefined;
      chunks.push(`\${${slice(content, expression)}}`);
      continue;
    }
    return undefined;
  }
  return `\`${chunks.join('')}\``;
}

function bagKey(name: string): string {
  return IDENTIFIER.test(name) ? name : JSON.stringify(name);
}

// A spec `defaults` entry, emitted as a JS EXPRESSION rather than a value — an absent attribute
// becomes the literal, a present one keeps its expression and has the operation applied around it.
// That distinction is the whole point: a value map would produce `null` for `<Text
// ellipsizeMode={null}>` on the lowered tag while the wrapper path yields 'tail', which is the
// divergence that shipped in Solid's plugin. `lower-host-primitives.test.ts` holds the emitted bag
// against `resolveTextProps` for exactly that reason.
function foldExpression(op: IFoldOp, authored: string | undefined): string {
  if (op.op === 'notFalse')
    return authored === undefined ? 'true' : `${authored} !== false`;
  const fallback = JSON.stringify(op.value);
  return authored === undefined ? fallback : `${authored} ?? ${fallback}`;
}

function applyDefaults(
  entries: Map<string, string>,
  defaults: IHostPrimitive['defaults'],
): void {
  // Every key is emitted UNCONDITIONALLY, present or not — a fold whose two branches emit
  // different key sets is its own hazard, and the spec says so.
  for (const key of Object.keys(defaults)) {
    entries.set(key, foldExpression(defaults[key], entries.get(key)));
  }
}

// The spec's `aliases` — today just RN's `id` -> `nativeID`, which WINS when both are set. The raw
// key must not survive into the bag: no ViewConfig declares `id`, so Fabric drops it silently.
//
// Driven by the spec rather than hand-written, and that CHANGED behaviour here: this file used to
// apply the alias to View only (an `else` branch that skipped Text), so `<Text id="x">` lowered to
// a raw `id` that never reached the native view. The spec carries the alias on BOTH tags, verified
// against Text.js:222 `const _nativeID = id ?? nativeID;`.
function applyAliases(
  entries: Map<string, string>,
  aliases: IHostPrimitive['aliases'],
): void {
  for (const from of Object.keys(aliases)) {
    const authored = entries.get(from);
    if (authored === undefined) continue;
    entries.delete(from);
    entries.set(aliases[from], authored);
  }
}

// The `>` that closes this element's open tag. Scanning starts past the last attribute, so a `>`
// inside an attribute expression can never be mistaken for it.
function openTagEnd(
  content: string,
  node: Record<string, unknown>,
  attributes: Record<string, unknown>[],
): number | undefined {
  const nameStart = numberAt(node, 'start');
  if (nameStart === undefined) return undefined;
  let cursor = nameStart;
  for (const attribute of attributes) {
    const end = numberAt(attribute, 'end');
    if (end !== undefined && end > cursor) cursor = end;
  }
  const index = content.indexOf('>', cursor);
  return index === -1 ? undefined : index + 1;
}

function collectEdits(
  content: string,
  tags: ReadonlyMap<string, IHostPrimitive>,
  nodes: unknown[],
  edits: IEdit[],
): boolean {
  let needsStateStyleHelper = false;
  for (const node of nodes) {
    if (!isRecord(node)) continue;
    const name = stringAt(node, 'name');
    const primitive = name === undefined ? undefined : tags.get(name);
    if (node.type === 'Component' && primitive !== undefined)
      needsStateStyleHelper =
        lowerElement(content, node, name ?? '', primitive, edits) ||
        needsStateStyleHelper;
    needsStateStyleHelper =
      collectEdits(content, tags, nestedNodes(node), edits) ||
      needsStateStyleHelper;
  }
  return needsStateStyleHelper;
}

// ---- the two refusals a STATEFUL primitive adds, on top of the ones every primitive has -------
//
// Both are gated on the spec's `observesState`. They exist because tier-2 resolves a primitive's
// own state BELOW the framework — `:active` in the style registry — and that state never travels
// back up. A call site that reads it therefore cannot be lowered, and the failure if we lower it
// anyway is a button that renders and does not respond, with nothing red anywhere.

// `style` is the channel a press-aware call site reads state through
// (`style={({pressed}) => …}`), and it no longer REFUSES — it splits.
//
// The allow-list below is now about which styles need the split, not which are allowed. Anything
// not provably inert goes through `resolveStateStyle` at runtime, which calls the callback once per
// press state and hands the engine both looks. An Identifier is the case that makes invocation
// strictly better than compile-time substitution: `style={styleFn}` cannot be proven to be an
// object or a function by any transform, and a runtime `typeof` decides it for free.
//
// The inert set stays because those styles need no split at all — one key instead of a helper call
// and an extra object, on the overwhelmingly common shape.
const INERT_STYLE_EXPRESSIONS: ReadonlySet<string> = new Set([
  'ObjectExpression',
  'ArrayExpression',
  'Literal',
  'TemplateLiteral',
]);

function needsStateStyleSplit(attribute: Record<string, unknown>): boolean {
  if (stringAt(attribute, 'name') !== 'style') return false;
  const value = attribute.value;
  // A quoted literal (`style="…"`) arrives as a Text array and is inert by construction.
  if (!isRecord(value)) return false;
  if (value.type !== 'ExpressionTag') return false;
  const expression = value.expression;
  if (!isRecord(expression)) return true;
  const kind = stringAt(expression, 'type');
  return kind === undefined || !INERT_STYLE_EXPRESSIONS.has(kind);
}

// A children SNIPPET that takes a parameter is Svelte's render prop, and the parameter is the
// press state. Zero-arity is NOT a refusal — `{#snippet children()}` and a plain child are
// ordinary lazy children, and that distinction matters more here than in the other adapters
// because every child of a Svelte component is a snippet whether the author wrote one or not.
function hasRenderPropChild(node: Record<string, unknown>): boolean {
  const fragment = node.fragment;
  if (!isRecord(fragment) || !Array.isArray(fragment.nodes)) return false;
  for (const child of fragment.nodes) {
    if (!isRecord(child) || child.type !== 'SnippetBlock') continue;
    const parameters = child.parameters;
    if (Array.isArray(parameters) && parameters.length > 0) return true;
  }
  return false;
}

function lowerElement(
  content: string,
  node: Record<string, unknown>,
  name: string,
  primitive: IHostPrimitive,
  edits: IEdit[],
): boolean {
  const rawAttributes = node.attributes;
  if (!Array.isArray(rawAttributes)) return false;
  const attributes: Record<string, unknown>[] = [];
  for (const attribute of rawAttributes) {
    // THE REFUSAL. A spread or any directive means the attribute set is not fully visible here.
    if (!isRecord(attribute) || attribute.type !== 'Attribute') return false;
    attributes.push(attribute);
  }

  // A stateful primitive still refuses a render-prop child — that one is not a style and no
  // runtime call can recover the parameter the template wants to read.
  if (primitive.observesState === true && hasRenderPropChild(node))
    return false;

  const entries = new Map<string, string>();
  let splitStateStyle = false;
  for (const attribute of attributes) {
    const key = stringAt(attribute, 'name');
    if (key === undefined) return false;
    const value = attributeValue(content, attribute);
    if (value === undefined) return false; // unreadable value shape — refuse the element
    if (primitive.observesState === true && needsStateStyleSplit(attribute)) {
      // Spread ONE call rather than emitting two: the author's expression is evaluated once, and a
      // function literal allocates one closure instead of two.
      entries.set(STATE_STYLE_SPREAD, `...${STATE_STYLE_LOCAL}(${value})`);
      splitStateStyle = true;
      continue;
    }
    entries.set(key, value);
  }

  applyAliases(entries, primitive.aliases);
  applyDefaults(entries, primitive.defaults);

  const start = numberAt(node, 'start');
  const end = numberAt(node, 'end');
  const tagEnd = openTagEnd(content, node, attributes);
  if (start === undefined || end === undefined || tagEnd === undefined)
    return false;

  const bag = [...entries]
    .map(([key, value]) =>
      key === STATE_STYLE_SPREAD ? value : `${bagKey(key)}: ${value}`,
    )
    .join(', ');
  const isSelfClosing = content.slice(tagEnd - 2, tagEnd) === '/>';
  const open = `<${primitive.intrinsic} p={{${bag}}}${isSelfClosing ? ' />' : '>'}`;
  edits.push({ start, end: tagEnd, text: open });
  if (isSelfClosing) return splitStateStyle;

  // The children between the tags are left byte-for-byte alone; only the closing name changes.
  const closing = `</${name}>`;
  if (content.slice(end - closing.length, end) !== closing)
    return splitStateStyle;
  edits.push({
    start: end - closing.length,
    end,
    text: `</${primitive.intrinsic}>`,
  });
  return splitStateStyle;
}

// Back-to-front, so an earlier edit's offsets stay valid — same as the sibling preprocessors.
function applyEdits(content: string, edits: IEdit[]): string {
  return [...edits]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (source, edit) =>
        source.slice(0, edit.start) + edit.text + source.slice(edit.end),
      content,
    );
}

// The helper import, placed immediately after the `@symbiote-native/svelte` import that made this
// file lowerable at all. That statement is guaranteed to exist — lowering only fires on names
// imported from the package — so no `<script>` block has to be created or parsed, and Svelte hoists
// an instance-script import to module scope anyway.
//
// Returning undefined means the anchor could not be found, and the caller then emits the file
// UNCHANGED rather than a lowered file whose helper is missing. Same asymmetry as every other
// refusal here: doing nothing is always safe, emitting a half-wired file is not.
function stateStyleImportEdit(content: string): IEdit | undefined {
  // `matchAll`, never `exec`. PACKAGE_IMPORT is a module-level /g regex shared with
  // `lowerableTagsIn`, and `exec` leaves `lastIndex` pointing past the match — which `matchAll`
  // then SEEDS from on the next file, so the import is not found, the file is not lowered, and it
  // happens only when more than one file runs. Cost an order-dependent test failure that passed in
  // isolation. `matchAll` reads `lastIndex` but clones the regex, so it leaves nothing behind.
  const [match] = [...content.matchAll(PACKAGE_IMPORT)];
  if (match === undefined) return undefined;
  const afterImport = match.index + match[0].length;
  const semicolon = content[afterImport] === ';' ? 1 : 0;
  const at = afterImport + semicolon;
  return {
    start: at,
    end: at,
    text: `\nimport { resolveStateStyle as ${STATE_STYLE_LOCAL} } from '${STATE_STYLE_MODULE}';`,
  };
}

export function lowerHostPrimitives(): {
  markup(input: IMarkupInput): { code: string };
} {
  return {
    markup({ content, filename }) {
      const tags = lowerableTagsIn(content);
      if (tags.size === 0) return { code: content };
      const ast: unknown = parse(content, { filename, modern: true });
      const edits: IEdit[] = [];
      const fragment = isRecord(ast) ? ast.fragment : undefined;
      const nodes =
        isRecord(fragment) && Array.isArray(fragment.nodes)
          ? fragment.nodes
          : [];
      const needsStateStyleHelper = collectEdits(content, tags, nodes, edits);
      if (edits.length === 0) return { code: content };
      if (needsStateStyleHelper) {
        const injected = stateStyleImportEdit(content);
        if (injected === undefined) return { code: content }; // cannot inject — refuse the file
        edits.push(injected);
      }
      return { code: applyEdits(content, edits) };
    },
  };
}
