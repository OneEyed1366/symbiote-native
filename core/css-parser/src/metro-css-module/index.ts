// Compiles a standalone .css/.scss/.sass/.less/.styl (and their .module.* twins) file into a
// plain JS module — the framework-agnostic twin of a Vue SFC's inline <style>/<style module>
// block (adapters/vue/metro-vue-transformer.cjs), usable from ANY adapter's own source file:
// a default import of `Card.module.scss` works the same from a React .tsx, a Vue <script>, or an
// Angular .ts.
//
// A plain style file registers its classes globally, exactly like an unscoped Vue <style>
// block — side-effect import only (`import './theme.scss'`), no default export. A `.module.*`
// file is ALWAYS scoped (that's the entire point of the extension): **lightningcss** owns the
// renaming, `composes`, and `:global()` handling, and hands back both the renamed CSS and the
// authored-name -> scoped-name `exports` map. We keep only what is genuinely ours — turning CSS
// declarations into RN style objects (`compileCssToRules`).
//
// lightningcss is MPL-2.0 and this package is MIT. Depending on it is fine (file-level copyleft
// does not reach our files); NEVER vendor, copy, or patch its sources — a copied file would
// carry MPL.
//
// A preprocessor source (SCSS/Sass/Less/Stylus) is reduced to plain CSS text via
// preprocessors.ts's `compile()` BEFORE lightningcss runs — it reads plain CSS only.
import * as path from 'node:path';
import type { CSSModuleExports, CSSModuleReference } from 'lightningcss';
import { compileCssToRules, type IStyleRule } from '../lightning/rules.ts';
import { hashFilePath } from '../file-scope-id.ts';
import { compile, detectLanguage } from '../preprocessors/index.ts';

export interface ICompiledCssFile {
  code: string;
}

export function isCssModuleFile(filename: string): boolean {
  const ext = path.extname(filename);
  if (!ext) return false;
  return filename.slice(0, -ext.length).endsWith('.module');
}

// A `composes` entry names the SCOPED class, so walking a chain (`.a composes .b`, `.b composes
// .c`) needs the way back to the composed class's own export — lightningcss reports one hop, not
// the flattened set.
function localsByScopedName(exports: CSSModuleExports): Map<string, string> {
  const locals = new Map<string, string>();
  for (const [local, entry] of Object.entries(exports)) {
    locals.set(entry.name, local);
  }
  return locals;
}

function referenceTokens(
  reference: CSSModuleReference,
  exports: CSSModuleExports,
  locals: ReadonlyMap<string, string>,
  visited: Set<string>,
  filename: string,
): string[] {
  // Resolving one would mean compiling the other file here, which this per-file transform cannot
  // do. Warn-and-drop is what the declaration mapper already does with a property it cannot map.
  if (reference.type === 'dependency') {
    console.warn(
      `[@symbiote-native/css-parser] ${filename}: \`composes: ${reference.name} from ` +
        `"${reference.specifier}"\` ` +
        'crosses files and is not supported — dropped.',
    );
    return [];
  }
  if (reference.type === 'global') return [reference.name];

  const local = locals.get(reference.name);
  return local === undefined
    ? [reference.name]
    : tokensFor(local, exports, locals, visited, filename);
}

// Composed names come FIRST, the class's own name LAST. The runtime registry merges a
// space-separated class string left to right (core/engine/src/style-registry), so this is what
// makes the composing class override what it composes — the cascade order `composes` means.
function tokensFor(
  local: string,
  exports: CSSModuleExports,
  locals: ReadonlyMap<string, string>,
  visited: Set<string>,
  filename: string,
): string[] {
  if (visited.has(local)) return [];
  visited.add(local);

  const entry = exports[local];
  if (entry === undefined) return [];

  const tokens: string[] = [];
  for (const reference of entry.composes) {
    tokens.push(
      ...referenceTokens(reference, exports, locals, visited, filename),
    );
  }
  tokens.push(entry.name);
  return tokens;
}

// `globals` is deliberately a SUPERSET of what CSS Modules specifies. lightningcss (like
// css-loader and every other CSS Modules implementation) exports only the names it renamed, and
// a `:global(...)` name is
// by definition not renamed — so upstream has nothing to map and omits it. For us that omission
// would force the author back to a bare string literal (`class="legacy-reset"`), throwing away the
// typed, discoverable `styles.x` access that is the entire reason this map exists. So a global
// name is exported as ITSELF: same key, no scope suffix.
function classMapFrom(
  exports: CSSModuleExports,
  globals: ReadonlySet<string>,
  filename: string,
): Record<string, string> {
  const locals = localsByScopedName(exports);
  const classMap: Record<string, string> = {};
  // Sorted, because `exports` is a Rust HashMap whose iteration order is randomized PER PROCESS
  // — emitting it verbatim makes the generated module bytes differ between builds and churns
  // Metro's content cache. Measured, not assumed: three runs over one file gave three orders.
  const names = [...new Set([...Object.keys(exports), ...globals])].sort();

  for (const name of names) {
    // A name that is BOTH locally declared and `:global()`-wrapped elsewhere in the file resolves
    // as local — the rename actually happened, so the scoped spelling is the one that matches.
    const value =
      exports[name] === undefined
        ? name
        : tokensFor(name, exports, locals, new Set(), filename).join(' ');

    // Keyed AS AUTHORED — `.legacy-reset` keys as `legacy-reset`, read as
    // `styles['legacy-reset']`. This reverses an earlier camelCase decision (css-loader's
    // `exportLocalsConvention`), which existed only to keep dot access legal and paid for it by
    // merging `.legacy-reset` and `.legacyReset` into one key — a collision that needed a warning
    // to be survivable. Nothing downstream normalizes any more: the registry key is the authored
    // name too, and `classNamesToDtsSource`'s `formatKey` already quotes a non-identifier key, so
    // `styles['legacy-reset']` type-checks.
    classMap[name] = value;
  }
  return classMap;
}

export type ICompiledCssModule = {
  /** The rules, their tokens already carrying the scope. */
  rules: readonly IStyleRule[];
  /** The default export: authored name -> the token(s) to put in the markup. */
  classMap: Record<string, string>;
};

/**
 * One CSS source compiled as a CSS MODULE — a standalone `.module.*` file and a Vue
 * `<style module>` block are the same thing and go through this, so neither can register a class
 * under a name the other would not.
 *
 * The scope tail is our own `hashFilePath`, not lightningcss's `[hash]`: the runtime registry
 * parses this tail to factor a scope back out (SCOPE_TAIL_PATTERN in
 * core/engine/src/style-registry) and its alphabet is lowercase base36, which lightningcss's
 * mixed-case hash does not fit — that would silently kill scoped-token base layering. Same hash
 * the `<style scoped>` and Svelte scopers use, so all three scoping shapes stay one algorithm.
 */
export function compileCssModule(
  css: string,
  filename: string,
): ICompiledCssModule {
  const compiled = compileCssToRules(css, {
    filename,
    pattern: `[local]__module__${hashFilePath(filename)}`,
  });

  return {
    rules: compiled.rules,
    classMap: classMapFrom(compiled.moduleExports, compiled.globals, filename),
  };
}

async function toPlainCss(source: string, filename: string): Promise<string> {
  const lang = detectLanguage(filename);
  return lang === 'css' ? source : await compile(source, lang, filename);
}

/**
 * The names a `.module.*` file's default export actually carries.
 *
 * The `.d.ts` generator MUST read them from here rather than re-deriving names off the raw
 * source: what a rule MATCHES on and what the module EXPORTS are different sets. A compound
 * rule `.card.big` matches on both its tokens, but only the names the author wrote as classes
 * are exports. Typing off a re-derived set invents members that are `undefined` at runtime and
 * hides valid ones behind a TS2339.
 */
export async function moduleClassNames(
  source: string,
  filename: string,
): Promise<string[]> {
  const css = await toPlainCss(source, filename);
  return Object.keys(compileCssModule(css, filename).classMap);
}

// Preprocessing (SCSS/Less/Stylus → plain CSS text) is inherently async in Node — Less has no
// sync render API at all, and Stylus's callback-based render must be Promise-wrapped — so
// compileCssFile is async uniformly, even for a plain `.css` file that needs no preprocessing.
// See metro-transformer.ts for the fuller sync-vs-async writeup; the short version is that a
// sync fast-path for `.css` would fork this function into two shapes for a build-time-only,
// content-hash-cached call that is never a runtime hot path.
export async function compileCssFile(
  source: string,
  filename: string,
): Promise<ICompiledCssFile> {
  const css = await toPlainCss(source, filename);

  if (!isCssModuleFile(filename)) {
    const { rules } = compileCssToRules(css, { filename });
    return {
      code:
        `import { registerRules } from '@symbiote-native/engine';\n` +
        `registerRules(${serializeRules(rules)});\n`,
    };
  }

  const { rules, classMap } = compileCssModule(css, filename);

  return {
    code:
      [
        `import { registerRules } from '@symbiote-native/engine';`,
        `registerRules(${serializeRules(rules)});`,
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n') + '\n',
  };
}

// `combinators` is compile-time-only — the registry matches by token subset and never reads it —
// so it is stripped rather than shipped in every app bundle. Stage 4 is where it starts to mean
// something at runtime, and that is when it earns its bytes.
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
