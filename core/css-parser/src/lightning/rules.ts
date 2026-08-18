// The glue of the lightningcss-typed pipeline: CSS text in, engine style RULES out. One
// `transform()` call feeds both halves — `./selectors.ts` for the selector, `./declarations.ts`
// for the values — and nothing in between re-derives a name from text.
//
// WHY a rule instead of a key. The retired text pipeline COLLAPSED a selector into one string
// key (`.a.b` -> `aB`, camelCased) and the runtime registry reversed that guess by
// permuting the element's class tokens. Every lossy step in the collapse mapped two different
// selectors onto one key and the later rule silently overwrote the earlier — the seventh trap in
// `.claude/rules/style-registry-collisions.md`. A rule carries the TOKEN SET the selector was
// written with, so the registry matches by subset and there is nothing to guess or reverse.
//
// Class names are emitted AS AUTHORED (`card-title` stays `card-title`, plus whatever the scoping
// rename appended). No camelCase anywhere in this file: normalization is what the trap was made of.
//
// Measured 2026-08-20 and the reason this is ONE pass, not two: with `cssModules` on, the visitor
// still sees the ORIGINAL class names — lightningcss renames AFTER the visitor walk. So the AST
// gives authored tokens and `exports` gives their renamed spelling, and the renamed CSS text never
// has to be parsed a second time (which is exactly what `../metro-css-module/index.ts` had to do,
// and what mangled a scope tail whose base36 hash began with a letter).
//
// `:global()` is the one thing the mode DOES change, and it changes shape rather than presence:
// with `cssModules` off it is a `custom-function` pseudo-class holding a raw token stream, with it
// on a `kind:'global'` pseudo-class holding a real parsed selector. `./selectors.ts` handles both;
// either way the tokens come out and `exports` not naming them is what marks them global.
import { transform } from 'lightningcss';
import type { CSSModuleExports, Declaration } from 'lightningcss';
import {
  declarationToStyle,
  variablesIn,
  type IStyleObject,
} from './declarations.ts';
import { selectorsToMatches, type ISelectorCombinator } from './selectors.ts';
import { warnOnce } from '../values.ts';

// A conditional at-rule is DROPPED WHOLE, its nested rules with it. There is no media-query engine
// in React Native, so applying `.responsive` from `@media (min-width: 900px)` would paint it on
// every phone — worse than not supporting the rule, because it looks supported. The retired text
// pass dropped these too, but silently: it simply never walked into an at-rule. Measured
// 2026-08-20: returning `[]` from the at-rule visitor removes it BEFORE the walk descends, so a
// nested style rule never reaches the collector; without it lightningcss hoists it out.
//
// `@keyframes` and `@font-face` need no entry here — neither emits a style rule to begin with.
const CONDITIONAL_AT_RULES = ['media', 'supports', 'container'] as const;

// The wrappers `./selectors.ts` unwraps itself. lightningcss implements neither, so it reports both
// as an unsupported pseudo-class even though the rule survives.
const HANDLED_PSEUDO_CLASSES: ReadonlySet<string> = new Set(['global', 'deep']);

function isHandledPseudoClass(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const record: Record<string, unknown> = { ...value };
  return (
    record.type === 'UnsupportedPseudoClass' &&
    typeof record.value === 'string' &&
    HANDLED_PSEUDO_CLASSES.has(record.value)
  );
}

export interface IStyleRule {
  /** Class names as authored, then through {@link ICompiledCss.exports} when a pattern renamed them. */
  readonly tokens: readonly string[];
  readonly specificity: readonly [number, number, number];
  /** Source order across the whole file, 0-based. Breaks a specificity tie, as the cascade does. */
  readonly order: number;
  readonly style: IStyleObject;
  /**
   * One per gap between tokens. Carried but NOT yet consumed: the registry matches a rule by token
   * SUBSET, so `.a .b` still fires like `.a.b` today (trap 6). Stage 4 is where this starts to
   * mean something — it needs parent pointers, which only exist after the engine's commit walk.
   */
  readonly combinators: readonly ISelectorCombinator[];
}

export interface ICompileRulesOptions {
  readonly filename: string;
  /** Root font size for `rem`. */
  readonly remToPx?: number;
  /**
   * A lightningcss CSS-Modules pattern, `[local]` first — `[local]__module__<hash>` for a
   * `.module.*` file or a Vue `<style module>`, `[local]__data-v-<hash>` for a Vue `<style
   * scoped>`, `[local]__svelte-<hash>` for a Svelte `<style>`. Omitted for a plain global `.css`.
   */
  readonly pattern?: string;
}

export interface ICompiledCss {
  readonly rules: readonly IStyleRule[];
  /**
   * Authored class name -> the name it registers under, straight out of lightningcss. Empty
   * without a `pattern`. The markup rewriter reads THIS — never its own recomputation of the
   * name, which is the bug class the single-renamer design exists to close.
   */
  readonly exports: Readonly<Record<string, string>>;
  /**
   * The same map unflattened, kept because CSS Modules needs more than the new name: `composes`
   * lives on the entry, and resolving a chain (`.a composes .b composes .c`) walks it. Empty
   * without a `pattern`.
   */
  readonly moduleExports: CSSModuleExports;
  /**
   * Class tokens the rules use that lightningcss did NOT rename. Under a `pattern` that means
   * exactly one thing — the name came out of a `:global()` — so the escape hatch is DERIVED here
   * rather than re-detected by walking selectors a second time (which is all
   * a retired second selector walk ever was). Without a pattern nothing is renamed, so this is
   * simply every token in the file, and no caller has a use for it.
   */
  readonly globals: ReadonlySet<string>;
}

interface ICollectedRule {
  readonly tokens: readonly string[];
  readonly specificity: readonly [number, number, number];
  readonly combinators: readonly ISelectorCombinator[];
  readonly declarations: readonly Declaration[];
}

export function compileCssToRules(
  css: string,
  options: ICompileRulesOptions,
): ICompiledCss {
  const { filename, pattern, remToPx } = options;
  const collected: ICollectedRule[] = [];
  const exports: Record<string, string> = {};
  const warned = new Set<string>();

  const dropAtRule = (name: string) => (): [] => {
    warnOnce(
      warned,
      `at-rule:${name}`,
      `[@symbiote-native/css-parser] ${filename}: \`@${name}\` is not supported — the rules ` +
        'inside it are dropped. React Native evaluates no CSS condition at all; branch in JS ' +
        '(useWindowDimensions, Platform) instead.',
    );
    return [];
  };

  const result = transform({
    filename,
    code: Buffer.from(css),
    // A rule lightningcss cannot use must not take the whole file down: the retired text pass
    // never threw either, and a stylesheet is authored content, not our code.
    errorRecovery: true,
    // Without this `>>>` / `/deep/` die at parse as a dangling combinator, so the selector half
    // never gets the chance to fold them. Inert until stage 4 consumes a combinator.
    nonStandard: { deepSelectorCombinator: true },
    ...(pattern === undefined ? {} : { cssModules: { pattern } }),
    visitor: {
      Rule: {
        ...Object.fromEntries(
          CONDITIONAL_AT_RULES.map(name => [name, dropAtRule(name)]),
        ),
        style(rule) {
          // `dropped` is deliberately ignored here: `selectorsToMatches` already warns per drop,
          // with the reason spelled out for the author. Warning again from this level printed the
          // same drop twice.
          const { matches } = selectorsToMatches(
            rule.value.selectors,
            filename,
          );
          // `importantDeclarations` last: `!important` wins inside its own rule, and a later
          // entry overwrites an earlier one when both name the same RN property.
          const declarations = [
            ...rule.value.declarations.declarations,
            ...rule.value.declarations.importantDeclarations,
          ];
          for (const match of matches) {
            collected.push({ ...match, declarations });
          }
        },
      },
    },
  });

  // `errorRecovery` keeps a malformed rule from taking the file down, but silence is how a whole
  // rule disappears unnoticed: `examples/angular/**/ApiPlaygroundScreen.css` had a comment closed
  // early by a `.hero-*/` inside it, which swept the real class after it into a garbage selector.
  // The retired text pass "recovered" by registering the garbage; this one drops it — either way
  // the author has to be told.
  //
  // Two things this loop must NOT do. It must not claim an outcome — a SelectorError drops the
  // rule but a value-level one drops only the declaration, and asserting the wrong one is worse
  // than staying quiet about it. And it must not repeat a complaint we deliberately answer:
  // lightningcss does not implement `:global()` or `:deep()`, so it warns "not recognized as a
  // valid pseudo-class" for both while `./selectors.ts` unwraps them and keeps the rule. Passing
  // that through told the author their working rule was thrown away.
  for (const warning of result.warnings) {
    if (isHandledPseudoClass(warning.value)) continue;
    const where = `${warning.loc.line}:${warning.loc.column}`;
    warnOnce(
      warned,
      `lightningcss:${warning.type}:${warning.message}`,
      `[@symbiote-native/css-parser] ${filename}:${where}: ${warning.message}`,
    );
  }

  // Sorted: `exports` is a Rust HashMap whose iteration order is randomized PER PROCESS, and this
  // map is emitted into a generated module — an unsorted one churns Metro's content cache.
  for (const [local, entry] of Object.entries(result.exports ?? {}).sort(
    ([left], [right]) => (left < right ? -1 : 1),
  )) {
    exports[local] = entry.name;
  }

  // Custom properties come from their own pass because nothing guarantees `:root` is declared
  // before the rule that reads it — the retired text pass had the same two-phase shape.
  const variables = variablesIn(css, filename);
  const context = {
    filename,
    variables,
    ...(remToPx === undefined ? {} : { remToPx }),
  };

  const globals = new Set<string>();
  const rules = collected.map((rule, order) => ({
    tokens: rule.tokens.map(token => {
      const renamed = exports[token];
      if (renamed === undefined) globals.add(token);
      return renamed ?? token;
    }),
    specificity: rule.specificity,
    combinators: rule.combinators,
    order,
    style: rule.declarations.reduce<IStyleObject>(
      (style, declaration) => ({
        ...style,
        ...declarationToStyle(declaration, context),
      }),
      {},
    ),
  }));

  // A rule whose every declaration was dropped — all unsupported, or all `var()`s declared in
  // another file — has nothing to contribute, and keeping it only adds a candidate the registry
  // must consider on every lookup of those tokens.
  const painting = rules.filter(rule => Object.keys(rule.style).length > 0);

  return {
    rules: painting,
    exports,
    moduleExports: result.exports ?? {},
    globals,
  };
}
