// CSS text in, engine style rules out: one `transform()` feeds selectors and declarations
// A rule keeps its token set, not a collapsed key (trap 7 in `style-registry-collisions.md`)
// Class names stay as authored, and a name `exports` does not rename is a `:global()` one
import type { ICompiledProperty } from '@symbiote-native/engine';
import { transform } from 'lightningcss';
import type {
  CSSModuleExports,
  Declaration,
  StyleRule,
  TransformResult,
} from 'lightningcss';
import {
  keyframesOf,
  motionToStyle,
  type IKeyframesByName,
  type IKeyframesValue,
  type IPlainStyle,
  type IRuleStyle,
} from './animations.ts';
import { cssWithoutBrokenDeclarations } from './broken-declarations.ts';
import {
  declarationToStyle,
  type IDeclarationContext,
} from './declarations.ts';
import {
  createMediaTracker,
  type IMediaCondition,
  type IMediaTracker,
} from './media.ts';
import { propertyRuleOf } from './property-rule.ts';
import { isCustomDeclaration, variableOf } from './raw-var.ts';
import { selectorsToMatches, type ISelectorCombinator } from './selectors.ts';
import { stateStyle } from './state-rules.ts';
import { REM_TO_PX, warnOnce } from '../values.ts';

// Dropped whole with the rules inside, as RN answers none of these conditions
// Returning `[]` before the walk descends stops lightningcss hoisting a nested rule out
const CONDITIONAL_AT_RULES = ['supports'] as const;

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

export type IStyleRule = {
  /** Class names as authored, renamed through `exports` when a pattern applied */
  readonly tokens: readonly string[];
  readonly specificity: readonly [number, number, number];
  /** Source order across the file, 0-based, so it breaks a specificity tie */
  readonly order: number;
  /** A rule on a state writes each value under it, see `./state-rules.ts` */
  readonly style: IRuleStyle;
  /** Index into `ICompiledCss.conditions`, absent for a rule outside any `@media` */
  readonly cond?: number;
  /** One per gap between tokens, carried but not read yet: the registry matches by token subset */
  readonly combinators: readonly ISelectorCombinator[];
};

export type ICompileRulesOptions = {
  readonly filename: string;
  /** Root font size for `rem` */
  readonly remToPx?: number;
  /** CSS-Modules pattern with `[local]` first, such as `[local]__module__<hash>`, none if global */
  readonly pattern?: string;
};

/** A custom property declared on `:root`, which feeds the one table shared by all surfaces */
export type IRootVariable = {
  readonly name: string;
  readonly value: string;
  /** Index into `ICompiledCss.conditions`, absent outside any `@media` */
  readonly cond?: number;
};

export type ICompiledCss = {
  readonly rules: readonly IStyleRule[];
  /** `:root` custom properties in source order, so a later one wins as in the cascade */
  readonly rootVariables: readonly IRootVariable[];
  /** `@property` rules in source order, `cond` indexing `conditions` like a `:root` variable */
  readonly properties: readonly ICompiledProperty[];
  /** Each distinct `@media` condition once, indexed by `IStyleRule.cond` */
  readonly conditions: readonly IMediaCondition[];
  /** Authored class name -> the name it registers under, empty without a `pattern` */
  readonly exports: Readonly<Record<string, string>>;
  /** The same map unflattened, since CSS Modules reads `composes` off the entry */
  readonly moduleExports: CSSModuleExports;
  /** Tokens lightningcss did not rename, which under a `pattern` are the `:global()` names */
  readonly globals: ReadonlySet<string>;
};

type ICollectedRule = {
  readonly tokens: readonly string[];
  /** The state of the last compound (`:hover`), under which every value of the rule is written */
  readonly state?: string;
  readonly specificity: readonly [number, number, number];
  readonly combinators: readonly ISelectorCombinator[];
  readonly declarations: readonly Declaration[];
  readonly cond?: number;
};

type ICompileState = {
  readonly filename: string;
  readonly warned: Set<string>;
  readonly collected: ICollectedRule[];
  readonly keyframeRules: unknown[];
  readonly rootVariables: IRootVariable[];
  readonly properties: ICompiledProperty[];
  readonly media: IMediaTracker;
};

// Split out of `compileCssToRules` so each visitor step reads on its own
function dropAtRule(state: ICompileState, name: string): () => [] {
  return () => {
    warnOnce(
      state.warned,
      `at-rule:${name}`,
      `[@symbiote-native/css-parser] ${state.filename}: \`@${name}\` is not supported - the ` +
        'rules inside it are dropped. Branch in JS (useWindowDimensions, Platform) instead.',
    );
    return [];
  };
}

function collectRootVariables(
  state: ICompileState,
  declarations: readonly Declaration[],
  cond: number | undefined,
): void {
  for (const declaration of declarations) {
    const variable = variableOf(declaration);
    if (variable === null) continue;
    state.rootVariables.push({
      ...variable,
      ...(cond === undefined ? {} : { cond }),
    });
  }
}

function collectStyleRule(
  state: ICompileState,
  { value: rule }: { value: StyleRule },
): void {
  // `selectorsToMatches` announces every drop reason but `root`, which only this level can judge
  const { matches, dropped } = selectorsToMatches(
    rule.selectors,
    state.filename,
  );
  // `importantDeclarations` last, so a later entry wins when both name the same RN property
  const declarations = [
    ...(rule.declarations?.declarations ?? []),
    ...(rule.declarations?.importantDeclarations ?? []),
  ];
  const cond = state.media.idAt(rule.loc);
  const isRoot = dropped.some(entry => entry.reason === 'root');
  if (isRoot) collectRootVariables(state, declarations, cond);
  const paintsFromRoot =
    isRoot &&
    declarations.some(declaration => !isCustomDeclaration(declaration));
  if (paintsFromRoot) {
    warnOnce(
      state.warned,
      `root-paints:${state.filename}`,
      `[@symbiote-native/css-parser] ${state.filename}: a \`:root\` rule declares more than ` +
        'custom properties - everything else in it is dropped, because `:root` matches no ' +
        'node in React Native. Move those declarations onto a class.',
    );
  }
  for (const match of matches) {
    state.collected.push({
      ...match,
      declarations,
      ...(cond === undefined ? {} : { cond }),
    });
  }
}

// `errorRecovery` keeps one malformed rule from taking the file down, so the author is told here
// The outcome is not claimed: a selector error drops the rule, a value error one declaration
function reportWarnings(
  warnings: TransformResult['warnings'],
  state: ICompileState,
): void {
  for (const warning of warnings) {
    if (isHandledPseudoClass(warning.value)) continue;
    const where = `${warning.loc.line}:${warning.loc.column}`;
    warnOnce(
      state.warned,
      `lightningcss:${warning.type}:${warning.message}`,
      `[@symbiote-native/css-parser] ${state.filename}:${where}: ${warning.message}`,
    );
  }
}

// Sorted, since the Rust HashMap order is random per process and this lands in a generated module
function exportedNames(result: TransformResult): Record<string, string> {
  const names: Record<string, string> = {};
  const entries = Object.entries(result.exports ?? {}).sort(
    ([left], [right]) => (left < right ? -1 : 1),
  );
  for (const [local, entry] of entries) names[local] = entry.name;
  return names;
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
  names: Readonly<Record<string, string>>,
  order: number,
): IStyleRule | null {
  if (keyframes.size === 0) return null;
  const style: IRuleStyle = {};
  for (const [name, steps] of keyframes) {
    style[`@keyframes ${names[name] ?? name}`] = steps;
  }
  return { tokens: [], specificity: [0, 0, 0], order, style, combinators: [] };
}

function toRules(
  collected: readonly ICollectedRule[],
  names: Readonly<Record<string, string>>,
  context: IDeclarationContext,
  state: ICompileState,
): { rules: IStyleRule[]; globals: Set<string> } {
  const globals = new Set<string>();
  const keyframes = keyframesByName(state.keyframeRules, context);
  const styleFor = (rule: ICollectedRule): IRuleStyle => {
    const style = styleOf(rule.declarations, context, keyframes);
    if (rule.state === undefined) return style;
    return stateStyle(style, rule.state, () =>
      warnOnce(
        state.warned,
        `state-motion:${state.filename}`,
        `[@symbiote-native/css-parser] ${state.filename}: an animation or a transition is ` +
          'dropped from a rule on a state, since it cannot hold for one state only. Put it on ' +
          'the class.',
      ),
    );
  };
  const rules = collected.map((rule, order) => ({
    tokens: rule.tokens.map(token => {
      const renamed = names[token];
      if (renamed === undefined) globals.add(token);
      return renamed ?? token;
    }),
    specificity: rule.specificity,
    combinators: rule.combinators,
    order,
    ...(rule.cond === undefined ? {} : { cond: rule.cond }),
    style: styleFor(rule),
  }));
  // A rule with no declaration left only adds a candidate for the registry to weigh per lookup
  const painting = rules.filter(rule => Object.keys(rule.style).length > 0);
  const carrier = keyframesCarrier(keyframes, names, rules.length);
  return {
    rules: carrier === null ? painting : [...painting, carrier],
    globals,
  };
}

// Kept apart from `compileCssToRules` so the transform call reads on its own
function createState(
  filename: string,
  remToPx: number | undefined,
  warned: Set<string>,
): ICompileState {
  const media = createMediaTracker({
    remToPx: remToPx ?? REM_TO_PX,
    onUnsupported: (what, atRule) =>
      warnOnce(
        warned,
        `${atRule}:${what}`,
        `[@symbiote-native/css-parser] ${filename}: ${what} cannot be answered here, so the ` +
          `\`@${atRule}\` rule that uses it is dropped.`,
      ),
  });
  return {
    filename,
    warned,
    collected: [],
    keyframeRules: [],
    rootVariables: [],
    properties: [],
    media,
  };
}

type ICompilePass = {
  readonly compiled: ICompiledCss;
  readonly warnings: TransformResult['warnings'];
};

function compilePass(
  css: string,
  options: ICompileRulesOptions,
  warned: Set<string>,
): ICompilePass {
  const { filename, pattern, remToPx } = options;
  const state = createState(filename, remToPx, warned);

  const result = transform({
    filename,
    code: Buffer.from(css),
    errorRecovery: true,
    // Without this `>>>` and `/deep/` die at parse as a dangling combinator
    nonStandard: { deepSelectorCombinator: true },
    ...(pattern === undefined ? {} : { cssModules: { pattern } }),
    visitor: {
      Rule: {
        ...Object.fromEntries(
          CONDITIONAL_AT_RULES.map(name => [name, dropAtRule(state, name)]),
        ),
        media: state.media.onMedia,
        container: state.media.onContainer,
        keyframes: rule => {
          state.keyframeRules.push(rule.value);
        },
        property: ({ value: rule }) => {
          const descriptor = propertyRuleOf(css, rule);
          if (descriptor === null) return;
          const cond = state.media.idAt(rule.loc);
          state.properties.push(
            cond === undefined ? descriptor : { ...descriptor, cond },
          );
        },
        style: rule => collectStyleRule(state, rule),
      },
    },
  });
  reportWarnings(result.warnings, state);

  const names = exportedNames(result);
  const context = { filename, ...(remToPx === undefined ? {} : { remToPx }) };
  const { rules, globals } = toRules(state.collected, names, context, state);

  const compiled = {
    rules,
    rootVariables: state.rootVariables,
    properties: state.properties,
    conditions: state.media.conditions(),
    exports: names,
    moduleExports: result.exports ?? {},
    globals,
  };
  return { compiled, warnings: result.warnings };
}

export function compileCssToRules(
  css: string,
  options: ICompileRulesOptions,
): ICompiledCss {
  const warned = new Set<string>();
  try {
    const first = compilePass(css, options, warned);
    // A second pass over the source, since lightningcss loses the declarations before a broken one
    const repaired = cssWithoutBrokenDeclarations(css, first.warnings);
    return repaired === null
      ? first.compiled
      : compilePass(repaired, options, warned).compiled;
  } catch (error) {
    // `lightningcss` overflows its stack on absurd nesting and throws a bare error
    if (!(error instanceof RangeError)) throw error;
    throw new Error(
      `[@symbiote-native/css-parser] ${options.filename}: rules nest too deeply to compile`,
      { cause: error },
    );
  }
}
