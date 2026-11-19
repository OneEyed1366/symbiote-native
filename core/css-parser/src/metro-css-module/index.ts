// Compiles a .css/.scss/.sass/.less/.styl file and its .module.* twin into a JS module
// A plain file registers globally, a module file is always scoped and exports a name map
// lightningcss (MPL-2.0) owns renaming and `composes`: depend on it, never copy its sources
import * as path from 'node:path';
import type { ICompiledProperty } from '@symbiote-native/engine';
import type { CSSModuleExports, CSSModuleReference } from 'lightningcss';
import type { IMediaCondition } from '../lightning/media.ts';
import {
  compileCssToRules,
  type IRootVariable,
  type IStyleRule,
} from '../lightning/rules.ts';
import { hashFilePath } from '../file-scope-id.ts';
import { compile, detectLanguage } from '../preprocessors/index.ts';

export type ICompiledCssFile = {
  code: string;
};

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

type IComposeContext = {
  exports: CSSModuleExports;
  locals: ReadonlyMap<string, string>;
  visited: Set<string>;
  filename: string;
};

function referenceTokens(
  reference: CSSModuleReference,
  context: IComposeContext,
): string[] {
  // Resolving one would mean compiling the other file here, which this per-file transform cannot
  // do. Warn-and-drop is what the declaration mapper already does with a property it cannot map.
  if (reference.type === 'dependency') {
    console.warn(
      `[@symbiote-native/css-parser] ${context.filename}: \`composes: ${reference.name} from ` +
        `"${reference.specifier}"\` ` +
        'crosses files and is not supported — dropped.',
    );
    return [];
  }
  if (reference.type === 'global') return [reference.name];

  const local = context.locals.get(reference.name);
  return local === undefined ? [reference.name] : tokensFor(local, context);
}

// Composed names come first and the class's own name last, so the composing class wins
// The registry merges a space-separated class string left to right
function tokensFor(local: string, context: IComposeContext): string[] {
  if (context.visited.has(local)) return [];
  context.visited.add(local);

  const entry = context.exports[local];
  if (entry === undefined) return [];

  const tokens: string[] = [];
  for (const reference of entry.composes) {
    tokens.push(...referenceTokens(reference, context));
  }
  tokens.push(entry.name);
  return tokens;
}

// A `:global(...)` name is exported as itself, since upstream omits it from the map
// Markup would then need a bare literal and lose the typed `styles.x` access
function classMapFrom(
  exports: CSSModuleExports,
  globals: ReadonlySet<string>,
  filename: string,
): Record<string, string> {
  const locals = localsByScopedName(exports);
  // Sorted, since the Rust export map iterates in a random order per process and churns the cache
  const names = [...new Set([...Object.keys(exports), ...globals])].sort();
  const classMap: Record<string, string> = {};

  for (const name of names) {
    // A name both local and `:global()` elsewhere resolves as local, since the rename happened
    const value =
      exports[name] === undefined
        ? name
        : tokensFor(name, {
            exports,
            locals,
            visited: new Set(),
            filename,
          }).join(' ');

    // Keyed as authored (`styles['legacy-reset']`), so nothing downstream normalizes the name
    classMap[name] = value;
  }
  return classMap;
}

export type ICompiledCssModule = {
  /** The rules, their tokens already carrying the scope. */
  rules: readonly IStyleRule[];
  /** The default export: authored name -> the token(s) to put in the markup. */
  classMap: Record<string, string>;
  /** The `@media` conditions the rules' `cond` indices point into. */
  conditions: readonly IMediaCondition[];
  /** The `:root` custom properties, whose `cond` indices point into the same table. */
  rootVariables: readonly IRootVariable[];
  /** The `@property` rules, whose `cond` indices point into the same table. */
  properties: readonly ICompiledProperty[];
};

/**
 * One CSS source compiled as a CSS module, for a `.module.*` file and a Vue `<style module>` alike
 * The scope tail is our `hashFilePath`, since the registry parses a lowercase base36 tail back out
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
    conditions: compiled.conditions,
    rootVariables: compiled.rootVariables,
    properties: compiled.properties,
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

// Always async, since Less has no sync render API and Stylus renders through a callback
// Even a plain `.css` takes this path, so the function keeps one shape
export async function compileCssFile(
  source: string,
  filename: string,
): Promise<ICompiledCssFile> {
  const css = await toPlainCss(source, filename);

  if (!isCssModuleFile(filename)) {
    const compiled = compileCssToRules(css, { filename });
    return { code: registrationLines(compiled).join('\n') + '\n' };
  }

  const compiled = compileCssModule(css, filename);

  return {
    code:
      [
        ...registrationLines(compiled),
        `export default ${JSON.stringify(compiled.classMap)};`,
      ].join('\n') + '\n',
  };
}

// `combinators` is compile-time-only, the registry never reads it, so it stays out of the bundle
// Shared by the Vue and Svelte emitters, which wrap their own call around the same text
export function serializeRules(rules: readonly IStyleRule[]): string {
  return JSON.stringify(
    rules.map(({ tokens, specificity, order, style, cond }) => ({
      tokens,
      specificity,
      order,
      style,
      cond,
    })),
  );
}

// The condition table rides in the same call, so a rule's `cond` index always has its table
function registerCall(
  rules: readonly IStyleRule[],
  conditions: readonly IMediaCondition[],
): string {
  return `registerRules(${serializeRules(rules)}${conditionsArgument(conditions)});`;
}

// The trailing `, [...]` argument of a registration call, empty when the file has no `@media`
export function conditionsArgument(
  conditions: readonly IMediaCondition[],
): string {
  return conditions.length === 0 ? '' : `, ${JSON.stringify(conditions)}`;
}

type IRegistrations = {
  rules: readonly IStyleRule[];
  conditions: readonly IMediaCondition[];
  rootVariables: readonly IRootVariable[];
  properties: readonly ICompiledProperty[];
};

// The call every emitter writes for a file's `@property` rules, none when the file has no rule
// The condition table rides along, as for `:root` variables, so a `cond` index has its table
export function propertiesCall(
  properties: readonly ICompiledProperty[],
  conditions: readonly IMediaCondition[],
): string {
  return `registerProperties(${JSON.stringify(properties)}${conditionsArgument(conditions)});`;
}

// The `:root` call reuses the table the rules were compiled with, so a `cond` index stays valid
// A file without `:root` variables or `@property` rules emits neither the import nor the call
function registrationLines(compiled: IRegistrations): string[] {
  const { rules, conditions, rootVariables, properties } = compiled;
  const imported = ['registerRules'];
  const calls = [registerCall(rules, conditions)];
  if (rootVariables.length > 0) {
    imported.push('registerRootVariables');
    calls.push(
      `registerRootVariables(${JSON.stringify(rootVariables)}${conditionsArgument(conditions)});`,
    );
  }
  if (properties.length > 0) {
    imported.push('registerProperties');
    calls.push(propertiesCall(properties, conditions));
  }
  return [
    `import { ${imported.join(', ')} } from '@symbiote-native/engine';`,
    ...calls,
  ];
}
