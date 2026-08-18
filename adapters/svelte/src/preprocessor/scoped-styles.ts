// A `.svelte` file's `<style>` block, compiled to real native styles.
//
// WHY SVELTE'S OWN CSS OUTPUT CANNOT BE CONSUMED — measure this before "simplifying" any of the
// below back to "just wire up `result.css`". Compiled with this adapter's options
// (`generate:'client', fragments:'tree', css:'external'`), a `<style>` block behaves one of two
// ways:
//
//   <symbiote-view class="card">   ->  result.css: `.card.svelte-4psua6 { … }`
//                                      result.js:  `$.set_class(node, 1, 'card svelte-4psua6')`
//   <View class="card">            ->  warning: css_unused_selector
//                                      result.css: `/* (unused) .card { … }*/`
//
// The first is dead: `set_class` writes `dom.className`, which `ShimElement` does not implement,
// and app code never authors a host tag anyway (§22a). The second is 100% of real app code —
// Svelte refuses to scope a parent's styles into a child COMPONENT, so by the time `result.css`
// exists every rule is commented out. Nothing is left to register, so the scoping has to happen
// HERE, before the compiler ever sees the block — the same pass `adapters/vue/metro-vue-
// transformer.cjs` runs for a Vue SFC (symbiote-sfc-style-compiler §5), moved from a compiler
// node-transform to a source rewrite because Svelte's compiler exposes no AST hook.
//
// Four steps, in order:
//   1. cut the block out TEXTUALLY (see STYLE_TAG_PATTERN) and compile it through
//      @symbiote-native/css-parser's `compileScopedCss`, exactly like Vue's <style scoped> —
//      lightningcss renames every class this file owns, `card` -> `card__svelte-<hash>`, and
//      hands back the name map; the styles register under those names in the same global
//      registry App.css and Vue SFC blocks populate.
//   2. rewrite `class` in THIS file's own markup by READING that map — never by re-deriving the
//      name, which is how the two halves used to be two implementations of "what is this class
//      called now". Static values resolve here, at build time; a dynamic `class={expr}` is
//      wrapped in a runtime call to `scopeSvelteClass` (../style-scope) that resolves through the
//      SAME map, emitted beside it.
//   3. delete the `<style>` block from the source handed on, so Svelte emits no
//      `css_unused_selector` warnings and adds no scope hash of its own.
//   4. append one `<script module>` line holding the `registerRules()` call and the name map.
//
// SCOPING SEMANTICS, AND THE ONE DELIBERATE DIVERGENCE FROM SVELTE-ON-THE-WEB. Svelte scopes by
// FILE: only markup written in this file carries the scope, never markup a child component owns
// — reproduced exactly, step 2 only ever rewrites this file's own source text. Where this
// diverges is the component boundary: on the web, `<Child class="card"/>` does NOT apply the
// parent's `.card`, because the hash never lands on the child's element. Here it does, because
// the scoped NAME travels as an ordinary prop and every Symbiote component forwards `class` down
// to its host node. Not incidental: a component here renders only other components, so the web
// rule would make every `<style>` block a no-op — exactly the bug this file exists to fix. An
// author's mental model still holds: "my `<style>` styles the markup I wrote".
//
// Registered in `svelte.config.js`'s `preprocess` AND called directly by
// `metro-svelte-transformer.cjs`, for the same reason `forbid-web-only-constructs.ts` is — the
// config covers `svelte-check`/the language server, the transformer covers a consuming app whose
// own config never registers it.
//
// LINE NUMBERS ARE PRESERVED ON PURPOSE (this preprocessor emits no source map): the `<style>`
// block is replaced by the same number of newlines it occupied rather than deleted outright, and
// the injected script is one line appended after all original content, or spliced onto the
// existing `<script module>` tag's own line — so every original line keeps its number and a
// `svelte-check` diagnostic still points at the right place.

import { parse } from 'svelte/compiler';
import {
  compile as compilePreprocessor,
  compileScopedCss,
  hashFilePath,
  type IPreprocessorLanguage,
  type IStyleRule,
} from '@symbiote-native/css-parser';
// Resolved by package SELF-REFERENCE, not the relative `../scope-token` the rest of this package
// would write — same reason metro-svelte-transformer.cjs reaches for
// `@symbiote-native/svelte/preprocessor`. `svelte.config.js` is loaded directly by Node
// (svelte-check, the language server), which strips types off a `.ts` file but still applies its
// own ESM resolver to what that file imports, where an extensionless relative specifier is
// ERR_MODULE_NOT_FOUND. The `exports` map supplies the extension at both targets — `src`
// in this workspace, `build` in a published install — so one line works in both. `scope-token`
// specifically, never `style-scope`: that one reaches the engine through `class-value`, a whole
// extensionless graph this build-time file must not pull in.
import {
  scopeToken,
  type IScopedNames,
} from '@symbiote-native/svelte/scope-token';

const SCOPE_ID_PREFIX = 'svelte-';
const ENGINE_MODULE = '@symbiote-native/engine';
const RUNTIME_MODULE = '@symbiote-native/svelte/style-scope';

// Every injected identifier is `__symbiote`-prefixed and import-aliased so a component that
// happens to declare its own `registerRules` / `scopeSvelteClass` cannot collide with it.
const REGISTER_RULES_LOCAL = '__symbioteRegisterRules';
const SCOPE_CLASS_LOCAL = '__symbioteScopeClass';
const SCOPED_NAMES_LOCAL = '__symbioteScopedNames';

// A `<style lang="…">` names its language directly, unlike a standalone file identified by its
// extension — so this is its own lookup rather than css-parser's extension-keyed
// `detectLanguage()`. Same table Vue's transformer keeps for the identical reason.
const DEFAULT_STYLE_LANG = 'css';
const STYLE_LANG_TO_PREPROCESSOR: ReadonlyMap<string, IPreprocessorLanguage> =
  new Map([
    ['css', 'css'],
    ['scss', 'scss'],
    ['sass', 'scss'],
    ['less', 'less'],
    ['stylus', 'stylus'],
    ['styl', 'stylus'],
  ]);

// Sass's indented syntax is selected off a `.sass`-suffixed PATH, and an inline block has no path
// of its own — so one is synthesized from the component's, exactly as Vue's transformer does.
const INDENTED_SASS_LANG = 'sass';

interface IEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface IMarkupInput {
  readonly content: string;
  readonly filename?: string;
}

export function scopedStyles(): {
  markup(input: IMarkupInput): Promise<{ code: string }>;
} {
  return {
    async markup({ content, filename }) {
      // Cheap gate: the overwhelming majority of components carry no <style> block at all, and
      // this saves them a full parse on every Metro transform.
      if (!content.includes('<style')) return { code: content };

      const styleBlock = findStyleBlock(content);
      if (styleBlock === undefined) return { code: content };

      const path = filename ?? 'component.svelte';
      const css = await compileStyleBlock(styleBlock, path);
      // A `:global(...)` selector opts out of scoping and registers under its plain name, the
      // same escape hatch Vue's <style scoped> has. lightningcss decides that — a name it did not
      // rename is absent from `names` and every token of it passes through untouched below.
      const { rules, names } = compileScopedCss(css, {
        filename: path,
        pattern: `[local]__${SCOPE_ID_PREFIX}${hashFilePath(path)}`,
      });

      // Parsed WITHOUT the style block, and with it replaced by same-length whitespace, so every
      // offset the AST reports still indexes `content` itself.
      const ast: unknown = parse(withoutStyleBlock(content, styleBlock), {
        filename,
        modern: true,
      });

      const edits: IEdit[] = [
        blankOut(styleBlock.start, styleBlock.end, content),
      ];
      collectClassEdits(fragmentNodes(ast), content, names, edits);
      if (rules.length > 0) {
        edits.push(injectModuleScript(ast, content, rules, names));
      }

      return { code: applyEdits(content, edits) };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The <style> block, located WITHOUT parsing it.
//
// This is svelte's own tag regex (src/compiler/preprocess/index.js), which is what its official
// `preprocess()` style hook uses to hand a block's content to a preprocessor unparsed — and the
// reason `svelte-preprocess` can compile SCSS at all. Reading `parse().css` instead, as this file
// did until 2026-08-20, validates the block as CSS whatever `lang` says: `<style lang="scss">$pad:
// 7px;</style>` threw `css_expected_identifier` before the language table above was ever
// consulted, so only SCSS that is already valid CSS (nesting) survived. A `<!-- -->` comment is an
// alternative of the pattern purely so a commented-out block is skipped rather than matched.

const STYLE_TAG_PATTERN =
  /<!--[^]*?-->|<style((?:\s+[^=>'"/\s]+=(?:"[^"]*"|'[^']*'|[^>\s]+)|\s+[^=>'"/\s]+)*\s*)(?:\/>|>([\S\s]*?)<\/style>)/g;

const LANG_ATTRIBUTE_PATTERN = /\blang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/;

interface IStyleBlock {
  readonly start: number;
  readonly end: number;
  readonly source: string;
  readonly lang: string;
}

function findStyleBlock(content: string): IStyleBlock | undefined {
  for (const match of content.matchAll(STYLE_TAG_PATTERN)) {
    const [text, attributes, source] = match;
    if (attributes === undefined || source === undefined) continue;
    return {
      start: match.index,
      end: match.index + text.length,
      source,
      lang: readLang(attributes),
    };
  }
  return undefined;
}

function readLang(attributes: string): string {
  const match = LANG_ATTRIBUTE_PATTERN.exec(attributes);
  if (match === null) return DEFAULT_STYLE_LANG;
  return match[1] ?? match[2] ?? match[3] ?? DEFAULT_STYLE_LANG;
}

// Same byte length, newlines kept: the AST's offsets stay valid against the ORIGINAL source, and
// svelte's own diagnostics keep their line numbers.
function withoutStyleBlock(content: string, block: IStyleBlock): string {
  const blanked = content.slice(block.start, block.end).replace(/[^\n]/g, ' ');
  return content.slice(0, block.start) + blanked + content.slice(block.end);
}

async function compileStyleBlock(
  block: IStyleBlock,
  filename: string,
): Promise<string> {
  const language = STYLE_LANG_TO_PREPROCESSOR.get(block.lang);
  if (language === undefined) {
    throw new Error(
      `${filename}: <style lang="${block.lang}"> is not supported — use css, scss, sass, less or stylus.`,
    );
  }
  const path =
    block.lang === INDENTED_SASS_LANG ? `${filename}.sass` : filename;
  return compilePreprocessor(block.source, language, path);
}

// ---------------------------------------------------------------------------------------------
// AST reading. `parse()`'s return type is not pinned here (same call, same reasoning as
// forbid-web-only-constructs.ts): it is read through runtime guards on `unknown` rather than
// trusting a shape nothing verifies.

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

// The markup walk descends through every child value rather than one known key: a `class`
// attribute can sit inside an {#if}/{#each} branch, a snippet body, or a component's children,
// and those hang off different fields. Deliberately started from `ast.fragment` alone, never the
// root — the `css` subtree has its own nodes carrying a `name` and would be walked for nothing.
function nestedNodes(node: Record<string, unknown>): unknown[] {
  const nested: unknown[] = [];
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) nested.push(...value);
    else if (isRecord(value)) nested.push(value);
  }
  return nested;
}

function collectClassEdits(
  nodes: unknown[],
  content: string,
  names: IScopedNames,
  edits: IEdit[],
): void {
  for (const node of nodes) {
    if (!isRecord(node)) continue;
    if (node.type === 'Attribute' && node.name === 'class') {
      const edit = classAttributeEdit(node, content, names);
      if (edit !== undefined) edits.push(edit);
      continue;
    }
    if (node.type === 'ClassDirective') {
      const edit = classDirectiveEdit(node, content, names);
      if (edit !== undefined) edits.push(edit);
      continue;
    }
    collectClassEdits(nestedNodes(node), content, names, edits);
  }
}

// `value` is `true` for a bare `class` attribute, one node for a lone value, or an array mixing
// Text and ExpressionTag for an interpolated one (`class="card {extra}"`). Normalizing to an
// array up front removes the per-shape branching everywhere below.
function attributeValueParts(
  attribute: Record<string, unknown>,
): unknown[] | undefined {
  const value = attribute.value;
  if (value === true) return undefined;
  if (Array.isArray(value)) return value;
  return isRecord(value) ? [value] : undefined;
}

function staticTextOf(attribute: Record<string, unknown>): string | undefined {
  const parts = attributeValueParts(attribute);
  if (parts === undefined) return undefined;
  let text = '';
  for (const part of parts) {
    if (!isRecord(part) || part.type !== 'Text') return undefined;
    const data = stringAt(part, 'data');
    if (data === undefined) return undefined;
    text += data;
  }
  return text;
}

function classAttributeEdit(
  attribute: Record<string, unknown>,
  content: string,
  names: IScopedNames,
): IEdit | undefined {
  const start = numberAt(attribute, 'start');
  const end = numberAt(attribute, 'end');
  const parts = attributeValueParts(attribute);
  if (start === undefined || end === undefined || parts === undefined)
    return undefined;

  const staticValue = staticTextOf(attribute);
  if (staticValue !== undefined) {
    const scoped = staticValue
      .split(/\s+/)
      .filter(Boolean)
      .map(token => scopeToken(token, names))
      .join(' ');
    // Nothing this file owns appears in the value — leave the source byte-identical rather than
    // re-quoting it, so a component with only `:global(...)` rules is untouched.
    if (scoped === staticValue) return undefined;
    return { start, end, text: `class="${scoped}"` };
  }

  // A dynamic value can only be scoped at runtime, and only if this file defines something to
  // scope against. With no local names there is nothing for the call to do, so it is not emitted
  // at all — and the map it would reference stays out of the bundle.
  if (names.size === 0) return undefined;
  const expression = expressionSourceOf(parts, content);
  if (expression === undefined) return undefined;
  return {
    start,
    end,
    text: `class={${SCOPE_CLASS_LOCAL}(${expression}, ${SCOPED_NAMES_LOCAL})}`,
  };
}

// `class:card={cond}` carries its class name in the DIRECTIVE, where the value rewrite above
// cannot see it. Svelte rejects the directive on a COMPONENT (`component_invalid_directive`), so
// only a host element reaches here — rewritten anyway, because a token left unscoped names a rule
// that registered under the scoped name and is silently dead. The shorthand `class:card` expands
// to `class:card__<scope>={card}`: the class is scoped, the variable it reads keeps its own name.
function classDirectiveEdit(
  directive: Record<string, unknown>,
  content: string,
  names: IScopedNames,
): IEdit | undefined {
  const name = stringAt(directive, 'name');
  const start = numberAt(directive, 'start');
  const end = numberAt(directive, 'end');
  if (name === undefined || start === undefined || end === undefined)
    return undefined;

  const scoped = scopeToken(name, names);
  if (scoped === name) return undefined;

  const expression = sliceExpression(directive, content);
  if (expression === undefined) return undefined;
  return { start, end, text: `class:${scoped}={${expression}}` };
}

// A lone `class={expr}` reproduces `expr` verbatim, so an arbitrary expression — a clsx array, a
// ternary, a function call — passes through untouched and only its RESULT gets scoped. An
// interpolated `class="a {b} c"` is rebuilt as the template literal Svelte itself would have
// concatenated, so both shapes reduce to one expression the runtime helper can take.
function expressionSourceOf(
  parts: unknown[],
  content: string,
): string | undefined {
  if (
    parts.length === 1 &&
    isRecord(parts[0]) &&
    parts[0].type === 'ExpressionTag'
  ) {
    return sliceExpression(parts[0], content);
  }

  let literal = '';
  for (const part of parts) {
    if (!isRecord(part)) return undefined;
    if (part.type === 'Text') {
      const data = stringAt(part, 'data');
      if (data === undefined) return undefined;
      literal += escapeTemplateLiteral(data);
      continue;
    }
    if (part.type !== 'ExpressionTag') return undefined;
    const expression = sliceExpression(part, content);
    if (expression === undefined) return undefined;
    literal += `\${${expression}}`;
  }
  return `\`${literal}\``;
}

function sliceExpression(
  part: Record<string, unknown>,
  content: string,
): string | undefined {
  const expression = part.expression;
  if (!isRecord(expression)) return undefined;
  const start = numberAt(expression, 'start');
  const end = numberAt(expression, 'end');
  if (start === undefined || end === undefined) return undefined;
  return content.slice(start, end);
}

function escapeTemplateLiteral(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

// ---------------------------------------------------------------------------------------------
// Emitting

// `combinators` is compile-time-only — the registry matches by token subset and never reads it —
// so it is stripped rather than shipped in every app bundle. Same cut `@symbiote-native/css-
// parser`'s `serializeRules` makes for a standalone `.css` file; a Svelte `<style>` block has no
// reason to ship more.
function serializeRules(rules: readonly IStyleRule[]): string {
  return JSON.stringify(
    rules.map(({ tokens, specificity, order, style }) => ({
      tokens,
      specificity,
      order,
      style,
    })),
  );
}

function injectModuleScript(
  ast: unknown,
  content: string,
  rules: readonly IStyleRule[],
  names: IScopedNames,
): IEdit {
  const lines = [
    `import { registerRules as ${REGISTER_RULES_LOCAL} } from '${ENGINE_MODULE}';`,
    `${REGISTER_RULES_LOCAL}(${serializeRules(rules)});`,
  ];
  if (names.size > 0) {
    lines.unshift(
      `import { scopeSvelteClass as ${SCOPE_CLASS_LOCAL} } from '${RUNTIME_MODULE}';`,
    );
    // The SAME map the static rewrite above read, shipped verbatim: a dynamic value's tokens are
    // only known at runtime, and re-deriving their names there is the divergence this map exists
    // to make impossible.
    lines.push(
      `const ${SCOPED_NAMES_LOCAL} = new Map(${JSON.stringify([...names])});`,
    );
  }
  const source = lines.join(' ');

  // Svelte rejects a second `<script module>`, so an existing one is spliced into rather than
  // duplicated — at the very start of its body, which is the end of its own opening-tag line, so
  // no line number and no column of real code moves.
  const moduleBody = moduleScriptBodyStart(ast);
  if (moduleBody !== undefined) {
    return { start: moduleBody, end: moduleBody, text: source };
  }

  // No module script: append one after everything. A trailing `<script module>` compiles and its
  // consts are visible to the markup above it (verified against svelte 5.56.8), and appending
  // leaves every original offset untouched.
  const lang = instanceScriptLang(ast) === 'ts' ? ' lang="ts"' : '';
  return {
    start: content.length,
    end: content.length,
    text: `\n<script module${lang}>${source}</script>\n`,
  };
}

function moduleScriptBodyStart(ast: unknown): number | undefined {
  if (!isRecord(ast)) return undefined;
  const moduleScript = ast.module;
  if (!isRecord(moduleScript) || !isRecord(moduleScript.content))
    return undefined;
  return numberAt(moduleScript.content, 'start');
}

function instanceScriptLang(ast: unknown): string | undefined {
  if (!isRecord(ast)) return undefined;
  const instance = ast.instance;
  if (!isRecord(instance) || !Array.isArray(instance.attributes))
    return undefined;
  for (const attribute of instance.attributes) {
    if (isRecord(attribute) && attribute.name === 'lang')
      return staticTextOf(attribute);
  }
  return undefined;
}

// Newline-for-newline, so everything below the removed block keeps its line number.
function blankOut(start: number, end: number, content: string): IEdit {
  const removed = content.slice(start, end);
  return { start, end, text: '\n'.repeat(countNewlines(removed)) };
}

function countNewlines(text: string): number {
  let count = 0;
  for (const character of text) {
    if (character === '\n') count += 1;
  }
  return count;
}

// Applied back-to-front so an earlier edit's offsets stay valid. Edits never overlap: each one
// covers a distinct attribute, the style block, or a zero-width insertion point.
function applyEdits(content: string, edits: IEdit[]): string {
  return [...edits]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (source, edit) =>
        source.slice(0, edit.start) + edit.text + source.slice(edit.end),
      content,
    );
}
