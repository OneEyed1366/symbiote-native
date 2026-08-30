// Selector reading for the lightningcss pipeline: an AST walk that replaced the retired
// text-based `extractClassName` / `extractClassTokens` pair.
//
// That pair derived a registry key from the SELECTOR TEXT — it camelCased each class, collapsed
// every class in the selector into one concatenated key, and returned `null` for whatever its
// regexes failed to recognize. Each of those steps is lossy in a way that maps two different
// rules onto ONE key, and the later rule then overwrites the earlier per property, silently:
//
//   .card-title{…} .cardTitle{…}   -> both key `cardTitle`   the first rule is GONE
//   .card:hover{…} .card{…}        -> both key `card`        the :hover rule OVERWRITES the base
//   .card[data-x]{…}               -> key `card[dataX]`      a key no element can ever carry
//   .a.b / .a .b / .a>.b / .a+.b   -> all key `aB`           five selectors, one key, merged
//
// (Traps six and seven in `.claude/rules/style-registry-collisions.md`, measured 2026-08-20.)
//
// So this module reports what the selector ACTUALLY says and refuses to guess:
//   - tokens stay AS AUTHORED — `card-title` is `card-title`. Casing is the caller's problem, and
//     a caller that never re-cases can never collide two spellings onto one key.
//   - the class list stays a LIST, with the combinator of every gap beside it, so a descendant
//     rule is distinguishable from a compound one instead of both flattening to a concatenation.
//   - a selector RN can never match (pseudo-class/-element, attribute, element, id, universal) is
//     dropped WITH a reason and a warning, rather than silently degrading into a key that either
//     collides with a real rule or matches nothing at all.
//
// The caller must pass `nonStandard: { deepSelectorCombinator: true }` to lightningcss's
// `transform`/`bundle` for a `deep` combinator to ever appear: without it `>>>` and `/deep/` are
// rejected at parse time as an invalid dangling combinator and the whole rule is lost before this
// walk sees it. That flag covers ONLY those two spellings — the other three deep forms are not
// lightningcss features at all and need no flag, so do not go re-reading its docs looking for
// them: `::v-deep` / `::ng-deep` arrive as an ordinary custom pseudo-element between two
// descendant combinators, and Vue's `:deep(X)` as a custom-function pseudo-class whose payload is
// a raw token stream — structurally the same thing `:global(X)` is under that same mode. All three
// are folded into `deep` here.
//
// `:global(X)` arrives in TWO DIFFERENT SHAPES and BOTH are live, so both are handled (measured
// 2026-08-20, lightningcss 1.32, same CSS through both modes):
//
//   cssModules OFF  {kind:'custom-function', name:'global', arguments:[…raw token stream…]}
//   cssModules ON   {kind:'global',          selector:[…parsed SelectorComponent[]…]}
//
// A `.module.css` / scoped file runs WITH cssModules and gets the parsed form; the plain-`.css`
// pipeline runs WITHOUT it and gets the token stream. Handling only one of them silently drops the
// whole rule on the other — which is exactly how `:global(.reset)` in a `.module.css` came to
// contribute no rule and no export. `:deep()` does NOT have this split: lightningcss implements no
// `:deep()` at all, so it is the raw custom-function form under BOTH modes.

import type { Combinator, SelectorComponent, TokenOrValue } from 'lightningcss';

export type ISelectorCombinator =
  | 'none' // .a.b            compound, one element
  | 'descendant' // .a .b
  | 'child' // .a > .b
  | 'next-sibling' // .a + .b
  | 'later-sibling' // .a ~ .b
  | 'deep'; // .a >>> .b, /deep/, ::v-deep, ::ng-deep

export interface ISelectorMatch {
  /** Class names AS AUTHORED — NO camelCase, NO collapsing, in source order. */
  readonly tokens: readonly string[];
  /** CSS specificity (a,b,c) = (id, class/attr/pseudo-class, element/pseudo-element). */
  readonly specificity: readonly [number, number, number];
  /** The combinators between the tokens, one per gap (length === tokens.length - 1). */
  readonly combinators: readonly ISelectorCombinator[];
}

export interface IDroppedSelector {
  readonly reason:
    | 'root'
    | 'pseudo-class'
    | 'pseudo-element'
    | 'attribute'
    | 'element'
    | 'id'
    | 'universal'
    | 'unsupported';
  /** e.g. 'hover', '[data-x]', 'div'. */
  readonly detail: string;
}

export interface ISelectorResult {
  /** One per comma-separated selector that is usable. */
  readonly matches: readonly ISelectorMatch[];
  /** The rest, with a reason. */
  readonly dropped: readonly IDroppedSelector[];
}

// Why the rule can never fire on a device, per reason — the half of the warning that tells an
// author what to do instead of just what was thrown away.
const DROP_EXPLANATION: Record<IDroppedSelector['reason'], string> = {
  root: 'a `:root` rule paints nothing — it exists to declare custom properties, which are collected by their own pass',
  'pseudo-class':
    'React Native has no pseudo-class state (no hover/focus/nth-child)',
  'pseudo-element': 'React Native has no pseudo-elements',
  attribute: 'React Native has no attribute selectors',
  element: 'React Native has no element/tag selectors',
  id: 'React Native has no id selectors',
  universal: 'React Native has no universal selector',
  unsupported: 'this selector shape has no React Native equivalent',
};

const DEEP_PSEUDO_ELEMENTS = new Set(['v-deep', 'ng-deep']);

// Every `SelectorComponent['type']`, so the guard below rejects a shape lightningcss does not
// produce instead of trusting any object that happens to carry a `type` string.
const SELECTOR_COMPONENT_TYPES = new Set([
  'combinator',
  'universal',
  'namespace',
  'type',
  'id',
  'class',
  'attribute',
  'pseudo-class',
  'pseudo-element',
  'nesting',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSelectorComponent(value: unknown): value is SelectorComponent {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    SELECTOR_COMPONENT_TYPES.has(value.type)
  );
}

function isTokenOrValue(value: unknown): value is TokenOrValue {
  return isRecord(value) && typeof value.type === 'string';
}

/** The subset of lightningcss combinators this pipeline can act on; the rest drop the rule. */
function combinatorFor(value: Combinator): ISelectorCombinator | null {
  switch (value) {
    case 'descendant':
    case 'child':
    case 'next-sibling':
    case 'later-sibling':
      return value;
    // `>>>` and `/deep/` differ only in spelling; a caller that treats them apart would be
    // encoding CSS trivia, not a matching rule.
    case 'deep-descendant':
    case 'deep':
      return 'deep';
    default:
      return null;
  }
}

// lightningcss reports a plain state pseudo-class by name in `kind`. The TOKEN keeps the colon so
// it stays unspellable as a class name.
const STATE_PSEUDO_CLASS = 'active';
export const STATE_TOKEN = ':active';

interface IBuilder {
  readonly tokens: string[];
  readonly combinators: ISelectorCombinator[];
  readonly specificity: [number, number, number];
  /** The combinator that will separate the NEXT token from the one already collected. */
  pending: ISelectorCombinator;
  /** First problem found; the whole selector is dropped on it, but the walk keeps counting. */
  drop: IDroppedSelector | null;
}

function createBuilder(): IBuilder {
  return {
    tokens: [],
    combinators: [],
    specificity: [0, 0, 0],
    pending: 'none',
    drop: null,
  };
}

function pushToken(builder: IBuilder, name: string): void {
  if (builder.tokens.length > 0) builder.combinators.push(builder.pending);
  builder.tokens.push(name);
  builder.pending = 'none';
}

function setCombinator(builder: IBuilder, next: ISelectorCombinator): void {
  // A descendant never downgrades an explicit combinator already pending. lightningcss brackets
  // `::v-deep` with a synthetic descendant on BOTH sides, and inside a `:global()` token stream
  // `>` arrives surrounded by whitespace — in either case the second descendant would otherwise
  // erase the real combinator the author wrote.
  if (next === 'descendant' && builder.pending !== 'none') return;
  builder.pending = next;
}

function drop(
  builder: IBuilder,
  reason: IDroppedSelector['reason'],
  detail: string,
): void {
  builder.drop ??= { reason, detail };
}

//#region custom-function payload token streams

/**
 * Fold the payload of a custom-function pseudo-class into the builder as if its classes had been
 * written bare. Serves both `:global(X)` and `:deep(X)` — lightningcss implements neither, so both
 * arrive in the identical shape and one unwrapper covers them.
 *
 * This is the RAW-TOKEN half of `:global()`, which is the shape a PLAIN `.css` file produces —
 * it is not run through cssModules, so `:global()` stays a `custom-function` pseudo-class whose
 * arguments are an unparsed token stream (measured, lightningcss 1.32): `:global(.a > .b)` arrives
 * as delim `.` · ident `a` · white-space · delim `>` · white-space · delim `.` · ident `b`.
 * With cssModules ON the same source arrives as `kind:'global'` carrying a real parsed selector,
 * handled where that kind is matched — `:global()` never disappears, it changes shape, and
 * assuming the mode erased it is what silently killed the rule in every `.module.*` file.
 *
 * Neither wrapper changes which classes an element must carry — `:global()` only says a name lives
 * outside the file's scope, `:deep()` only says the match may cross a scope boundary. So the
 * payload participates exactly as if unwrapped, the rule `stripGlobalWrappers` follows in the text
 * parser. `wrapper` is the authored spelling, used only so a drop warning names the right one.
 */
function consumePayload(
  builder: IBuilder,
  args: readonly unknown[],
  wrapper: string,
): void {
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];

    if (!isTokenOrValue(argument) || argument.type !== 'token') {
      drop(builder, 'unsupported', wrapper);
      return;
    }

    const token = argument.value;

    switch (token.type) {
      case 'white-space':
        setCombinator(builder, 'descendant');
        break;

      case 'delim': {
        if (token.value === '>') {
          setCombinator(builder, 'child');
          break;
        }
        if (token.value === '+') {
          setCombinator(builder, 'next-sibling');
          break;
        }
        if (token.value === '~') {
          setCombinator(builder, 'later-sibling');
          break;
        }
        if (token.value === '*') {
          drop(builder, 'universal', '*');
          break;
        }
        if (token.value !== '.') {
          drop(
            builder,
            'unsupported',
            `${wrapper.slice(0, -1)}${token.value})`,
          );
          break;
        }
        // A class is two tokens — delim `.` then the ident. A `.` with no ident behind it means
        // the payload is malformed, and nothing about it is then trustworthy.
        const name = identAt(args, index + 1);
        if (name === null) {
          drop(builder, 'unsupported', wrapper);
          return;
        }
        builder.specificity[1]++;
        pushToken(builder, name);
        index++;
        break;
      }

      case 'colon': {
        // One colon is a pseudo-class, two a pseudo-element; either way the name is the ident
        // after them, and reporting it is the difference between a warning an author can act on
        // and one that only says ":global()" / ":deep()".
        const isPseudoElement = isColonAt(args, index + 1);
        const nameIndex = index + (isPseudoElement ? 2 : 1);
        const name = identAt(args, nameIndex) ?? wrapper;
        builder.specificity[isPseudoElement ? 2 : 1]++;
        // `:active` is kept on this path too, or the SAME CSS behaves differently on the
        // cssModules flag — the recurring hazard this file's header names. `:global(.btn:active)`
        // arrives parsed (`kind:'global'`) with cssModules ON and reaches the ordinary walk, which
        // keeps it; with the flag OFF it arrives here as a raw token stream and would drop the
        // WHOLE rule. Same source, opposite outcome, decided by which file it lives in.
        //
        // Keeping it is also the right side of the `:deep` asymmetry rather than an exception to
        // it: `:global()` says only that the NAME lives outside this file's scope, while
        // `:deep()` says the MATCH may cross a scope boundary. Only the second breaks the promise
        // the state token rests on — that the rule targets the node whose press machine owns the
        // state. Svelte cares most, since `:global()` is its ONLY escape hatch.
        if (!isPseudoElement && name === STATE_PSEUDO_CLASS) {
          if (
            builder.combinators.includes('deep') ||
            builder.pending === 'deep'
          ) {
            drop(builder, 'pseudo-class', 'active through a deep combinator');
          } else {
            pushToken(builder, STATE_TOKEN);
          }
          index = nameIndex;
          break;
        }
        drop(
          builder,
          isPseudoElement ? 'pseudo-element' : 'pseudo-class',
          name,
        );
        index = nameIndex;
        break;
      }

      case 'ident':
        builder.specificity[2]++;
        drop(builder, 'element', token.value);
        break;

      case 'id-hash':
        builder.specificity[0]++;
        drop(builder, 'id', `#${token.value}`);
        break;

      case 'square-bracket-block': {
        // The parsed shape reports `[data-x]` by name, so the token stream reads the name too —
        // otherwise the same CSS would warn differently depending on the cssModules flag. The
        // block's remaining tokens are left to fall through: they can only add a second drop, and
        // the first one already recorded is the one reported.
        const name = identAt(args, index + 1);
        builder.specificity[1]++;
        drop(builder, 'attribute', name === null ? '[…]' : `[${name}]`);
        break;
      }

      default:
        drop(builder, 'unsupported', wrapper);
        break;
    }
  }
}

function identAt(args: readonly unknown[], index: number): string | null {
  const argument = args[index];
  if (!isTokenOrValue(argument) || argument.type !== 'token') return null;
  return argument.value.type === 'ident' ? argument.value.value : null;
}

function isColonAt(args: readonly unknown[], index: number): boolean {
  const argument = args[index];
  return (
    isTokenOrValue(argument) &&
    argument.type === 'token' &&
    argument.value.type === 'colon'
  );
}

//#endregion custom-function payload token streams

function consumeComponent(
  builder: IBuilder,
  component: SelectorComponent,
): void {
  switch (component.type) {
    case 'class':
      builder.specificity[1]++;
      pushToken(builder, component.name);
      return;

    case 'combinator': {
      const combinator = combinatorFor(component.value);
      if (combinator === null) {
        drop(builder, 'unsupported', component.value);
        return;
      }
      setCombinator(builder, combinator);
      return;
    }

    case 'id':
      builder.specificity[0]++;
      drop(builder, 'id', `#${component.name}`);
      return;

    case 'type':
      builder.specificity[2]++;
      drop(builder, 'element', component.name);
      return;

    case 'universal':
      drop(builder, 'universal', '*');
      return;

    case 'attribute':
      builder.specificity[1]++;
      drop(builder, 'attribute', `[${component.name}]`);
      return;

    case 'pseudo-class':
      // Neither wrapper contributes specificity of its own — the payload's classes carry it.
      // The parsed `:global(X)` of cssModules mode. Its payload is an ordinary component array, so
      // the SAME walk reads it — which is also why a non-class payload drops with the payload's
      // own reason here for free, identically to the token-stream branch below.
      if (component.kind === 'global') {
        consumeSelector(builder, component.selector);
        return;
      }
      // `:root` is not state — it is where an author is SUPPOSED to declare custom properties, and
      // `collectCustomProperties` has already read them by the time this runs. Reported with its
      // own reason so the caller can stay silent about the ordinary token sheet and speak up only
      // when the rule also carries a declaration that would have painted. Warning unconditionally
      // meant every stylesheet with a `:root { --token: … }` block printed "it can never match",
      // about the one construct the docs tell people to write.
      if (component.kind === 'root') {
        drop(builder, 'root', 'root');
        return;
      }
      if (component.kind === 'custom-function') {
        if (component.name === 'global') {
          consumePayload(builder, component.arguments, ':global()');
          return;
        }
        if (component.name === 'deep') {
          // `:deep(X)` reaches THROUGH a scope boundary into X — the same relation `>>>` and
          // `::v-deep` express, so the gap into X's own tokens is `deep`, overriding the
          // descendant lightningcss reports just before it.
          setCombinator(builder, 'deep');
          consumePayload(builder, component.arguments, ':deep()');
          return;
        }
      }
      // `:active` is the ONE state pseudo-class this module keeps, and it is not an exception to
      // the "a selector RN can never match" principle above — it is the one state the ENGINE
      // actually knows, because the press machine owns it. It is kept as an ordinary compound
      // TOKEN (`.btn:active` -> tokens ['btn', ':active'], combinator 'none'), so specificity,
      // source order, scoping and the resolve cache all keep working with no new concept in the
      // registry: the engine adds the token to a pressed node's class list and the existing
      // matcher does the rest. A CSS identifier cannot carry an unescaped `:`, so the token can
      // never collide with a real class name.
      //
      // `:hover` / `:focus` stay dropped deliberately — RN has no hover or focus state the engine
      // owns — as do `:nth-child` and the rest. Widening past `:active` is its own decision, and
      // the limit it will hit is the registry's resolve cache: it is capped at 512 entries and
      // CLEARS WHOLE rather than evicting, so states that COMBINE multiply the distinct class
      // strings on a screen and can drop the cache, which breaks the identity `isAlreadyPublished`
      // depends on for every node at once.
      if (component.kind === STATE_PSEUDO_CLASS) {
        builder.specificity[1]++;
        // ...but NOT through a scope boundary. `:deep(.b:active)` already dropped, because a
        // custom-function payload is a raw token stream this walk re-parses; `.a >>> .b:active`
        // did NOT, because `>>>` is a real combinator and the walk reaches the pseudo-class
        // normally. Two spellings of one relation behaving differently is the bug, and the
        // decision (2026-08-23) is to refuse BOTH: a deep selector reaches into another
        // component's internals, and the state token is only meaningful on the node whose press
        // machine owns it — which is exactly the node a deep rule cannot predict.
        if (
          builder.combinators.includes('deep') ||
          builder.pending === 'deep'
        ) {
          drop(builder, 'pseudo-class', 'active through a deep combinator');
          return;
        }
        pushToken(builder, STATE_TOKEN);
        return;
      }
      // `:not()`/`:is()` take the specificity of their argument rather than a flat 1, but they are
      // dropped here regardless, and only a KEPT selector's specificity is ever read.
      builder.specificity[1]++;
      drop(
        builder,
        'pseudo-class',
        component.kind === 'custom' || component.kind === 'custom-function'
          ? component.name
          : component.kind,
      );
      return;

    case 'pseudo-element':
      if (
        component.kind === 'custom' &&
        DEEP_PSEUDO_ELEMENTS.has(component.name)
      ) {
        setCombinator(builder, 'deep');
        return;
      }
      builder.specificity[2]++;
      drop(
        builder,
        'pseudo-element',
        component.kind === 'custom' || component.kind === 'custom-function'
          ? component.name
          : component.kind,
      );
      return;

    // `namespace` (`ns|div`) and `nesting` (`&`) both need context this compiler does not have.
    default:
      drop(builder, 'unsupported', component.type);
      return;
  }
}

/**
 * `selectors` is lightningcss's own `rule.value.selectors` (an array of selector-component
 * arrays). Each entry is one comma-separated selector and is judged on its own: a list where some
 * parts survive and some drop yields both a match and a drop.
 */
function consumeSelector(
  builder: IBuilder,
  selector: readonly unknown[],
): void {
  for (const component of selector) {
    if (!isSelectorComponent(component)) {
      drop(builder, 'unsupported', String(component));
      continue;
    }
    consumeComponent(builder, component);
  }
}

export function selectorsToMatches(
  selectors: unknown,
  filename: string,
): ISelectorResult {
  if (!Array.isArray(selectors)) return { matches: [], dropped: [] };

  const matches: ISelectorMatch[] = [];
  const dropped: IDroppedSelector[] = [];

  for (const selector of selectors) {
    if (!Array.isArray(selector) || selector.length === 0) continue;

    const builder = createBuilder();
    consumeSelector(builder, selector);

    // No class survived and nothing explained why (a lone `::v-deep`, an empty compound) — there
    // is still nothing to register, so say so rather than emitting a match with zero tokens.
    if (builder.drop === null && builder.tokens.length === 0)
      drop(builder, 'unsupported', 'no class selector');

    const problem = builder.drop;
    if (problem !== null) {
      dropped.push(problem);
      // `root` is returned, never announced from here — see DROP_EXPLANATION.root.
      if (problem.reason === 'root') continue;
      console.warn(
        `[@symbiote-native/css-parser] ${filename}: dropped a rule on \`${problem.detail}\` — ${DROP_EXPLANATION[problem.reason]}, so it can never match in React Native.`,
      );
      continue;
    }

    matches.push({
      tokens: builder.tokens,
      combinators: builder.combinators,
      specificity: builder.specificity,
    });
  }

  return { matches, dropped };
}
