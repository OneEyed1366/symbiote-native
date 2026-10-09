// CSS text in, engine style RULES out: `./selectors.ts` reads the selector, `./declarations.ts` the
// values, `./animations.ts` the keyframes. A rule keeps the token SET of its selector, so the
// registry matches by subset instead of reversing a collapsed key
import { transform } from 'lightningcss';
import type {
  CSSModuleExports,
  Declaration,
  DeclarationBlock,
} from 'lightningcss';
import {
  keyframesOf,
  motionToStyle,
  type IKeyframesByName,
  type IKeyframesValue,
  type IPlainStyle,
  type IRuleStyle,
} from './animations.ts';
import {
  declarationToStyle,
  variablesIn,
  type IDeclarationContext,
} from './declarations.ts';
import { selectorsToMatches, type ISelectorCombinator } from './selectors.ts';
import { stateStyle } from './state-rules.ts';
import { warnOnce } from '../values.ts';

// A conditional at-rule is dropped whole with its rules: React Native has no media queries
// Returning `[]` from the visitor removes it before the walk, or lightningcss hoists the rules out
type IConditionalAtRule = 'media' | 'supports' | 'container';

const CONDITIONAL_AT_RULES = [
  'media',
  'supports',
  'container',
] as const satisfies readonly IConditionalAtRule[];

type IHandledPseudoClass = 'global' | 'deep';

// `./selectors.ts` unwraps both itself, but lightningcss reports them as unsupported pseudo-classes
const HANDLED_PSEUDO_CLASSES = [
  'global',
  'deep',
] as const satisfies readonly IHandledPseudoClass[];

const CUSTOM_PROPERTY = 'custom';
const ROOT_REASON = 'root';

function isHandledPseudoClass(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const record: Record<string, unknown> = { ...value };
  return (
    record.type === 'UnsupportedPseudoClass' &&
    HANDLED_PSEUDO_CLASSES.some(name => name === record.value)
  );
}

export type IStyleRule = {
  /** Class names as authored, then through `ICompiledCss.exports` when a pattern renamed them */
  readonly tokens: readonly string[];
  readonly specificity: readonly [number, number, number];
  /** Source order across the file, 0-based, which breaks a specificity tie as the cascade does */
  readonly order: number;
  readonly style: IRuleStyle;
  /** One per gap between tokens, not consumed yet: the registry matches by subset */
  readonly combinators: readonly ISelectorCombinator[];
};

export type ICompileRulesOptions = {
  readonly filename: string;
  /** Root font size for `rem` */
  readonly remToPx?: number;
  /**
   * A lightningcss CSS-Modules pattern with `[local]` first: `[local]__module__<hash>` for a
   * `.module.*` file, `[local]__data-v-<hash>` for a Vue `<style scoped>`, `[local]__svelte-<hash>`
   * for a Svelte `<style>`. Omitted for a plain global `.css`
   */
  readonly pattern?: string;
};

export type ICompiledCss = {
  readonly rules: readonly IStyleRule[];
  /** Authored class name -> the name it registers under, straight out of lightningcss */
  readonly exports: Readonly<Record<string, string>>;
  /** The same map unflattened, since CSS Modules `composes` lives on the entry */
  readonly moduleExports: CSSModuleExports;
  /** Class tokens lightningcss did not rename, which under a `pattern` came out of a `:global()` */
  readonly globals: ReadonlySet<string>;
};

type ICollectedRule = {
  readonly tokens: readonly string[];
  /** The state of the last compound (`:hover`), under which every value of the rule is written */
  readonly state?: string;
  readonly specificity: readonly [number, number, number];
  readonly combinators: readonly ISelectorCombinator[];
  readonly declarations: readonly Declaration[];
};

type ITransformed = ReturnType<typeof transform>;

type IWalked = {
  readonly collected: readonly ICollectedRule[];
  readonly keyframeRules: readonly unknown[];
  readonly result: ITransformed;
};

function warnDroppedAtRule(
  warned: Set<string>,
  filename: string,
  name: string,
): [] {
  warnOnce(
    warned,
    `at-rule:${name}`,
    `[@symbiote-native/css-parser] ${filename}: \`@${name}\` is not supported, the rules inside ` +
      'it are dropped. React Native evaluates no CSS condition, so branch in JS instead ' +
      '(useWindowDimensions, Platform)',
  );
  return [];
}

// Only here are the declarations in scope, and a `:root` that paints is worth a word
function warnRootPaints(
  warned: Set<string>,
  filename: string,
  declarations: readonly Declaration[],
): void {
  if (!declarations.some(({ property }) => property !== CUSTOM_PROPERTY)) {
    return;
  }
  warnOnce(
    warned,
    `root-paints:${filename}`,
    `[@symbiote-native/css-parser] ${filename}: a \`:root\` rule declares more than custom ` +
      'properties, and everything else in it is dropped because `:root` matches no node in ' +
      'React Native. Move those declarations onto a class',
  );
}

function warnMotionInState(warned: Set<string>, filename: string): void {
  warnOnce(
    warned,
    `state-motion:${filename}`,
    `[@symbiote-native/css-parser] ${filename}: an animation or a transition is dropped from a ` +
      'rule on a state, since it cannot hold for one state only. Put it on the class',
  );
}

// `!important` goes last: it wins inside its own rule, and a later entry overwrites an earlier one
function declarationsOf(block: DeclarationBlock): readonly Declaration[] {
  return [
    ...(block.declarations ?? []),
    ...(block.importantDeclarations ?? []),
  ];
}

function collectStyleRule(
  value: {
    selectors: Parameters<typeof selectorsToMatches>[0];
    declarations: DeclarationBlock;
  },
  filename: string,
  warned: Set<string>,
  into: ICollectedRule[],
): void {
  // Every drop reason but `root` is announced by `selectorsToMatches` itself
  const { matches, dropped } = selectorsToMatches(value.selectors, filename);
  const declarations = declarationsOf(value.declarations);
  if (dropped.some(entry => entry.reason === ROOT_REASON)) {
    warnRootPaints(warned, filename, declarations);
  }
  for (const match of matches) into.push({ ...match, declarations });
}

function walkCss(
  css: string,
  options: ICompileRulesOptions,
  warned: Set<string>,
): IWalked {
  const { filename, pattern } = options;
  const dropAtRule = (name: string) => (): [] =>
    warnDroppedAtRule(warned, filename, name);
  const collected: ICollectedRule[] = [];
  const keyframeRules: unknown[] = [];

  const result = transform({
    filename,
    code: Buffer.from(css),
    // A rule lightningcss cannot use must not take the whole file down, it is authored content
    errorRecovery: true,
    // Without this `>>>` / `/deep/` die at parse as a dangling combinator
    nonStandard: { deepSelectorCombinator: true },
    ...(pattern === undefined ? {} : { cssModules: { pattern } }),
    visitor: {
      Rule: {
        ...Object.fromEntries(
          CONDITIONAL_AT_RULES.map(name => [name, dropAtRule(name)]),
        ),
        keyframes(rule) {
          keyframeRules.push(rule.value);
        },
        style(rule) {
          collectStyleRule(rule.value, filename, warned, collected);
        },
      },
    },
  });
  return { collected, keyframeRules, result };
}

// `errorRecovery` keeps a malformed rule from taking the file down, but silence is how a whole rule
// disappears unnoticed, so the author is told. Not a pseudo-class `./selectors.ts` answers itself
function reportParseWarnings(
  result: ITransformed,
  filename: string,
  warned: Set<string>,
): void {
  for (const warning of result.warnings) {
    if (isHandledPseudoClass(warning.value)) continue;
    const where = `${warning.loc.line}:${warning.loc.column}`;
    warnOnce(
      warned,
      `lightningcss:${warning.type}:${warning.message}`,
      `[@symbiote-native/css-parser] ${filename}:${where}: ${warning.message}`,
    );
  }
}

// Sorted, since `exports` is a hash map with a random order per process and this map is emitted
// into a generated module, where an unsorted one churns Metro's content cache
function sortedExports(result: ITransformed): Record<string, string> {
  const exports: Record<string, string> = {};
  const entries = Object.entries(result.exports ?? {}).sort(
    ([left], [right]) => (left < right ? -1 : 1),
  );
  for (const [local, entry] of entries) exports[local] = entry.name;
  return exports;
}

function keyframesByName(
  keyframeRules: readonly unknown[],
  context: IDeclarationContext,
): IKeyframesByName {
  const byName = new Map<string, IKeyframesValue>();
  for (const rule of keyframeRules) {
    const found = keyframesOf(rule, declaration =>
      declarationToStyle(declaration, context),
    );
    if (found !== null) byName.set(found.name, found.steps);
  }
  return byName;
}

function styleOf(
  declarations: readonly Declaration[],
  context: IDeclarationContext,
  keyframes: IKeyframesByName,
): IPlainStyle {
  return declarations.reduce<IPlainStyle>(
    (style, declaration) => ({
      ...style,
      ...(motionToStyle(declaration, keyframes) ??
        declarationToStyle(declaration, context)),
    }),
    {},
  );
}

// The file's keyframes ride in the rules array as a rule with no tokens, so every emitter ships
// them unchanged and the registry finds them for an animation named in another file
function keyframesCarrier(
  keyframes: IKeyframesByName,
  exports: Readonly<Record<string, string>>,
  order: number,
): IStyleRule | null {
  if (keyframes.size === 0) return null;
  const style: IRuleStyle = {};
  for (const [name, steps] of keyframes) {
    style[`@keyframes ${exports[name] ?? name}`] = steps;
  }
  return { tokens: [], specificity: [0, 0, 0], order, style, combinators: [] };
}

export function compileCssToRules(
  css: string,
  options: ICompileRulesOptions,
): ICompiledCss {
  const { filename, remToPx } = options;
  const warned = new Set<string>();
  const { collected, keyframeRules, result } = walkCss(css, options, warned);
  reportParseWarnings(result, filename, warned);

  // Custom properties come from their own pass, since nothing guarantees `:root` comes first
  const context: IDeclarationContext = {
    filename,
    variables: variablesIn(css, filename),
    ...(remToPx === undefined ? {} : { remToPx }),
  };
  const keyframes = keyframesByName(keyframeRules, context);

  const styleFor = (rule: ICollectedRule): IRuleStyle => {
    const style = styleOf(rule.declarations, context, keyframes);
    if (rule.state === undefined) return style;
    return stateStyle(style, rule.state, () =>
      warnMotionInState(warned, filename),
    );
  };

  const exports = sortedExports(result);
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
    style: styleFor(rule),
  }));

  // A rule whose declarations were all dropped adds a candidate the registry weighs on every lookup
  const painting = rules.filter(rule => Object.keys(rule.style).length > 0);
  const carrier = keyframesCarrier(keyframes, exports, rules.length);

  return {
    rules: carrier === null ? painting : [...painting, carrier],
    exports,
    moduleExports: result.exports ?? {},
    globals,
  };
}
