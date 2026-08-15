// A `.svelte` file's `<style>` block, compiled to real native styles.
//
// WHY SVELTE'S OWN CSS OUTPUT CANNOT BE CONSUMED — measure this before "simplifying" any of the
// below back to "just wire up `result.css`". Compiled with this adapter's options
// (`generate:'client', fragments:'tree', css:'external'`), a `<style>` block behaves in one of
// two ways:
//
//   <symbiote-view class="card">   ->  result.css: `.card.svelte-4psua6 { … }`
//                                      result.js:  `$.set_class(node, 1, 'card svelte-4psua6')`
//   <View class="card">            ->  warning: css_unused_selector
//                                      result.css: `/* (unused) .card { … }*/`
//
// The first is dead because `set_class` writes `dom.className`, which `ShimElement` does not
// implement — and app code never authors a host tag anyway (§22a). The second is 100% of real
// app code, and Svelte deliberately refuses to scope a parent's styles into a child COMPONENT,
// so by the time `result.css` exists every rule in it is commented out. There is nothing left
// to register. The scoping therefore has to happen HERE, before the compiler ever sees the
// block — conceptually the same pass `adapters/vue/metro-vue-transformer.cjs` runs for a Vue SFC
// (symbiote-sfc-style-compiler §5), moved from a compiler node-transform to a source rewrite
// because Svelte's compiler exposes no AST hook.
//
// Four steps, in order:
//   1. parse the block out and compile it through @symbiote-native/css-parser, exactly like Vue's
//      <style scoped> — every class registers under a per-file-suffixed key, `card` ->
//      `card__svelte-<hash>`, in the same global registry App.css and Vue SFC blocks populate.
//   2. rewrite `class` in THIS file's own markup so it names the suffixed key. Static values are
//      resolved here, at build time; a dynamic `class={expr}` is wrapped in a runtime call to
//      `scopeSvelteClass` (../style-scope), which is the only shape that can scope a value the
//      compiler cannot see into.
//   3. delete the `<style>` block from the source handed on, so Svelte emits no
//      `css_unused_selector` warnings and adds no scope hash of its own.
//   4. append one `<script module>` line holding the `registerStyles()` call and the two
//      per-file constants the rewrite in step 2 refers to.
//
// SCOPING SEMANTICS, AND THE ONE DELIBERATE DIVERGENCE FROM SVELTE-ON-THE-WEB. Svelte scopes by
// FILE: only the markup written in this file carries the scope, never markup a child component
// owns. That rule is reproduced exactly — step 2 only ever rewrites this file's own source text.
// Where this diverges is the component boundary: on the web, `<Child class="card"/>` does NOT
// apply the parent's `.card`, because the hash never lands on the child's element. Here it does,
// because the scoped NAME travels as an ordinary prop and every Symbiote component forwards
// `class` down to its host node. That divergence is not incidental — in this project a component
// renders only other components, so the web rule would make every `<style>` block a no-op, which
// is precisely the bug this file exists to fix. An author's mental model still holds: "my
// `<style>` styles the markup I wrote".
//
// Registered in `svelte.config.js`'s `preprocess` AND called directly by
// `metro-svelte-transformer.cjs`, for the same reason `forbid-web-only-constructs.ts` is — the
// config covers `svelte-check`/the language server, the transformer covers a consuming app whose
// own config never registers it.
//
// LINE NUMBERS ARE PRESERVED ON PURPOSE (this preprocessor emits no source map, matching its
// sibling): the `<style>` block is replaced by the same number of newlines it occupied rather
// than deleted outright, and the injected script is one single line appended AFTER all original
// content, or spliced onto the existing `<script module>` tag's own line. So every original line
// keeps its number and a `svelte-check` diagnostic still points at the right place.

import { parse } from 'svelte/compiler';
import {
  classTokensIn,
  compile as compilePreprocessor,
  globalClassNamesIn,
  hashFilePath,
  parseCSS,
  type IPreprocessorLanguage,
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
import { scopeToken } from '@symbiote-native/svelte/scope-token';

const SCOPE_ID_PREFIX = 'svelte-';
const ENGINE_MODULE = '@symbiote-native/engine';
const RUNTIME_MODULE = '@symbiote-native/svelte/style-scope';

// Every injected identifier is `__symbiote`-prefixed and import-aliased so a component that
// happens to declare its own `registerStyles` / `scopeSvelteClass` cannot collide with it.
const REGISTER_STYLES_LOCAL = '__symbioteRegisterStyles';
const SCOPE_CLASS_LOCAL = '__symbioteScopeClass';
const SCOPED_NAMES_LOCAL = '__symbioteScopedNames';
const SCOPE_ID_LOCAL = '__symbioteScopeId';

// A `<style lang="…">` names its language directly, unlike a standalone file identified by its
// extension — so this is its own lookup rather than css-parser's extension-keyed
// `detectLanguage()`. Same table Vue's transformer keeps for the identical reason.
const STYLE_LANG_TO_PREPROCESSOR: ReadonlyMap<string, IPreprocessorLanguage> = new Map([
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

      const ast: unknown = parse(content, { filename, modern: true });
      const styleBlock = readStyleBlock(ast);
      if (styleBlock === undefined) return { code: content };

      const path = filename ?? 'component.svelte';
      const css = await compileStyleBlock(styleBlock, path);
      const parsed = parseCSS(css, { filename: path });
      const exemptFromScope = globalClassNamesIn(css);
      const scopeId = SCOPE_ID_PREFIX + hashFilePath(path);

      // A `:global(...)` selector opts out of scoping and registers under its plain name, the
      // same escape hatch Vue's <style scoped> has. Everything else is suffixed and its ORIGINAL
      // name recorded, so the markup rewrite below knows which tokens this file owns.
      //
      // A COMPOUND or DESCENDANT selector registers under one collapsed key (`.card.big` ->
      // `cardBig`) that appears nowhere in the markup — the markup says `class="card big"`. So
      // the key alone is not enough to know what this file owns: its TOKENS are recorded too, or
      // a `.card.big` rule whose parts have no standalone rule of their own leaves both tokens
      // unscoped and the rule unreachable.
      const tokensByName = classTokensIn(css, { filename: path });
      const styles: Record<string, Record<string, unknown>> = {};
      const localNames = new Set<string>();
      for (const [className, props] of Object.entries(parsed)) {
        const isExempt = exemptFromScope.has(className);
        const registeredName = isExempt ? className : `${className}__${scopeId}`;
        if (!isExempt) {
          localNames.add(className);
          for (const token of tokensByName.get(className) ?? []) localNames.add(token);
        }
        styles[registeredName] = props;
      }

      const edits: IEdit[] = [blankOut(styleBlock.start, styleBlock.end, content)];
      collectClassEdits(fragmentNodes(ast), content, localNames, scopeId, edits);
      if (Object.keys(styles).length > 0) {
        edits.push(injectModuleScript(ast, content, styles, localNames, scopeId));
      }

      return { code: applyEdits(content, edits) };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// AST reading. `parse()`'s return type is not pinned here (same call, same reasoning as
// forbid-web-only-constructs.ts): it is read through runtime guards on `unknown` rather than
// trusting a shape nothing verifies.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function numberAt(node: Record<string, unknown>, key: string): number | undefined {
  const value = node[key];
  return typeof value === 'number' ? value : undefined;
}

function stringAt(node: Record<string, unknown>, key: string): string | undefined {
  const value = node[key];
  return typeof value === 'string' ? value : undefined;
}

interface IStyleBlock {
  readonly start: number;
  readonly end: number;
  readonly source: string;
  readonly lang: string;
}

function readStyleBlock(ast: unknown): IStyleBlock | undefined {
  if (!isRecord(ast)) return undefined;
  const css = ast.css;
  if (!isRecord(css)) return undefined;
  const start = numberAt(css, 'start');
  const end = numberAt(css, 'end');
  const content = css.content;
  if (start === undefined || end === undefined || !isRecord(content)) return undefined;
  const source = stringAt(content, 'styles');
  if (source === undefined) return undefined;
  return { start, end, source, lang: readLangAttribute(css) };
}

function readLangAttribute(block: Record<string, unknown>): string {
  const attributes = block.attributes;
  if (!Array.isArray(attributes)) return 'css';
  for (const attribute of attributes) {
    if (!isRecord(attribute) || attribute.name !== 'lang') continue;
    const text = staticTextOf(attribute);
    if (text !== undefined) return text;
  }
  return 'css';
}

async function compileStyleBlock(block: IStyleBlock, filename: string): Promise<string> {
  const language = STYLE_LANG_TO_PREPROCESSOR.get(block.lang);
  if (language === undefined) {
    throw new Error(
      `${filename}: <style lang="${block.lang}"> is not supported — use css, scss, sass, less or stylus.`,
    );
  }
  const path = block.lang === INDENTED_SASS_LANG ? `${filename}.sass` : filename;
  return compilePreprocessor(block.source, language, path);
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
  localNames: ReadonlySet<string>,
  scopeId: string,
  edits: IEdit[],
): void {
  for (const node of nodes) {
    if (!isRecord(node)) continue;
    if (node.type === 'Attribute' && node.name === 'class') {
      const edit = classAttributeEdit(node, content, localNames, scopeId);
      if (edit !== undefined) edits.push(edit);
      continue;
    }
    collectClassEdits(nestedNodes(node), content, localNames, scopeId, edits);
  }
}

// `value` is `true` for a bare `class` attribute, one node for a lone value, or an array mixing
// Text and ExpressionTag for an interpolated one (`class="card {extra}"`). Normalizing to an
// array up front removes the per-shape branching everywhere below.
function attributeValueParts(attribute: Record<string, unknown>): unknown[] | undefined {
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
  localNames: ReadonlySet<string>,
  scopeId: string,
): IEdit | undefined {
  const start = numberAt(attribute, 'start');
  const end = numberAt(attribute, 'end');
  const parts = attributeValueParts(attribute);
  if (start === undefined || end === undefined || parts === undefined) return undefined;

  const staticValue = staticTextOf(attribute);
  if (staticValue !== undefined) {
    const scoped = staticValue
      .split(/\s+/)
      .filter(Boolean)
      .map(token => scopeToken(token, localNames, scopeId))
      .join(' ');
    // Nothing this file owns appears in the value — leave the source byte-identical rather than
    // re-quoting it, so a component with only `:global(...)` rules is untouched.
    if (scoped === staticValue) return undefined;
    return { start, end, text: `class="${scoped}"` };
  }

  // A dynamic value can only be scoped at runtime, and only if this file defines something to
  // scope against. With no local names there is nothing for the call to do, so it is not emitted
  // at all — and the two constants it would reference stay out of the bundle.
  if (localNames.size === 0) return undefined;
  const expression = expressionSourceOf(parts, content);
  if (expression === undefined) return undefined;
  return {
    start,
    end,
    text: `class={${SCOPE_CLASS_LOCAL}(${expression}, ${SCOPED_NAMES_LOCAL}, ${SCOPE_ID_LOCAL})}`,
  };
}

// A lone `class={expr}` reproduces `expr` verbatim, so an arbitrary expression — a clsx array, a
// ternary, a function call — passes through untouched and only its RESULT gets scoped. An
// interpolated `class="a {b} c"` is rebuilt as the template literal Svelte itself would have
// concatenated, so both shapes reduce to one expression the runtime helper can take.
function expressionSourceOf(parts: unknown[], content: string): string | undefined {
  if (parts.length === 1 && isRecord(parts[0]) && parts[0].type === 'ExpressionTag') {
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

function sliceExpression(part: Record<string, unknown>, content: string): string | undefined {
  const expression = part.expression;
  if (!isRecord(expression)) return undefined;
  const start = numberAt(expression, 'start');
  const end = numberAt(expression, 'end');
  if (start === undefined || end === undefined) return undefined;
  return content.slice(start, end);
}

function escapeTemplateLiteral(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

// ---------------------------------------------------------------------------------------------
// Emitting

function injectModuleScript(
  ast: unknown,
  content: string,
  styles: Record<string, Record<string, unknown>>,
  localNames: ReadonlySet<string>,
  scopeId: string,
): IEdit {
  const lines = [
    `import { registerStyles as ${REGISTER_STYLES_LOCAL} } from '${ENGINE_MODULE}';`,
    `${REGISTER_STYLES_LOCAL}(${JSON.stringify(styles)});`,
  ];
  if (localNames.size > 0) {
    lines.unshift(`import { scopeSvelteClass as ${SCOPE_CLASS_LOCAL} } from '${RUNTIME_MODULE}';`);
    lines.push(
      `const ${SCOPED_NAMES_LOCAL} = new Set(${JSON.stringify([...localNames])});`,
      `const ${SCOPE_ID_LOCAL} = ${JSON.stringify(scopeId)};`,
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
  if (!isRecord(moduleScript) || !isRecord(moduleScript.content)) return undefined;
  return numberAt(moduleScript.content, 'start');
}

function instanceScriptLang(ast: unknown): string | undefined {
  if (!isRecord(ast)) return undefined;
  const instance = ast.instance;
  if (!isRecord(instance) || !Array.isArray(instance.attributes)) return undefined;
  for (const attribute of instance.attributes) {
    if (isRecord(attribute) && attribute.name === 'lang') return staticTextOf(attribute);
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
      (source, edit) => source.slice(0, edit.start) + edit.text + source.slice(edit.end),
      content,
    );
}
