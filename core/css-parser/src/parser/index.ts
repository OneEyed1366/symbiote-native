// CSS → React Native style-object compiler. `extractClassName` and the CSS-custom-property/
// `var()` resolution machinery are framework/target-agnostic. `evaluateCalc` treats `px` as
// identity (RN has no cell grid to scale against) and `rem`/`em` as scaled by the same
// {@link REM_TO_PX} constant as a bare value (see values.ts). `mapCSSProperty` (properties.ts)
// targets RN's `ViewStyle`/`TextStyle`.

import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import { mapCSSProperty } from '../properties.ts';
import { REM_TO_PX } from '../values.ts';

export type ICssParserOptions = {
  filename?: string;
};

//#region Selector utilities

// Exported: the SFC style compiler (metro-vue-transformer.js) reuses this exact conversion to
// normalize a template's kebab-case class="section-label" authoring to the camelCase key this
// module already registers CSS selectors under, so both spellings resolve to the same style.
export function kebabToCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function unescapeIdentifier(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}

const GLOBAL_PSEUDO_OPEN = ':global(';

// Index of the `)` closing the `(` at `openIndex`, or -1 if the selector is unbalanced. Counting
// depth rather than reaching for the next `)` is what keeps `:global(.a:not(.b))` in one piece.
function closingParenIndex(value: string, openIndex: number): number {
  let depth = 0;

  for (let index = openIndex; index < value.length; index++) {
    if (value[index] === '(') depth++;
    else if (value[index] === ')' && --depth === 0) return index;
  }

  return -1;
}

/**
 * Erase every `:global(...)` wrapper, leaving its payload in place: `.card :global(.legacy) span`
 * becomes `.card .legacy span`.
 *
 * `:global()` says a part of the selector lives outside the file's scope; it never changes which
 * classes an element must carry for the rule to match. So the wrapper is gone before any selector
 * shape is recognized below, and its payload participates exactly as if it had been written bare.
 * Which of the resulting tokens then gets a scope suffix is a separate, caller-side question that
 * `globalClassTokensIn` (../global-selectors.ts) answers, off the payloads {@link globalPayloadsIn}
 * hands back.
 *
 * This follows SVELTE, not Vue, and the two genuinely disagree. Svelte erases the wrapper per
 * relative selector and keeps the rest of the chain scoped (`.vendors/svelte-5.53.12-src/compiler/
 * phases/3-transform/css/index.js`, `ComplexSelector`: a part flagged `is_global` keeps its inner
 * selectors and only skips the scope class; `css-prune.js`'s `apply_selector` sets
 * `metadata.scoped` on every part that is not an outer `:global`). Vue's `pluginScoped` instead
 * does `selector.replaceWith(n.nodes[0])` on `:global` (`.vendors/vue/packages/compiler-sfc/src/
 * style/pluginScoped.ts`), which throws the REST of the chain away — `.card :global(.reset)`
 * degrades to a stylesheet-wide `.reset`. One registry serves React, Vue, Angular and Svelte
 * alike, so the rule that silently widens a rule's reach beyond what the author wrote is the
 * wrong one to standardize on; Vue itself steers the reach-into-a-child case to `:deep()`.
 */
function stripGlobalWrappers(selector: string): string {
  let result = selector;
  let start = result.indexOf(GLOBAL_PSEUDO_OPEN);

  while (start !== -1) {
    const close = closingParenIndex(result, start + GLOBAL_PSEUDO_OPEN.length - 1);
    // Unbalanced: leave the text alone and let the pseudo-class guard below drop the whole rule,
    // the same answer any other unparseable selector gets.
    if (close === -1) return result;

    const payload = result.slice(start + GLOBAL_PSEUDO_OPEN.length, close).trim();
    result = result.slice(0, start) + payload + result.slice(close + 1);
    // Re-search from the same offset: a payload may itself hold a `:global(...)`, and each pass
    // removes one wrapper, so this terminates.
    start = result.indexOf(GLOBAL_PSEUDO_OPEN, start);
  }

  return result;
}

/**
 * The payload of every `:global(...)` in a selector, wrapper removed and in source order:
 * `.card :global(.legacy) span` → `['.legacy']`, `:global(.a):global(.b)` → `['.a', '.b']`.
 *
 * The inverse view of {@link stripGlobalWrappers}: that one keeps everything BUT the wrappers,
 * this one keeps only what they held. Both share {@link closingParenIndex}, so "where does this
 * `:global(` end" has a single answer — the caller-side scope-suffix question needs to know which
 * tokens came out of a payload, and re-finding them with a second regex is how the two would
 * drift apart on `:global(.a:not(.b))`.
 *
 * A nested wrapper is left inside the payload it sits in; tokenizing the payload erases it.
 */
export function globalPayloadsIn(selector: string): string[] {
  const payloads: string[] = [];
  let start = selector.indexOf(GLOBAL_PSEUDO_OPEN);

  while (start !== -1) {
    const close = closingParenIndex(selector, start + GLOBAL_PSEUDO_OPEN.length - 1);
    // Unbalanced: the same answer stripGlobalWrappers gives — stop, and let the selector reach
    // the pseudo-class guard that drops the whole rule.
    if (close === -1) return payloads;

    payloads.push(selector.slice(start + GLOBAL_PSEUDO_OPEN.length, close).trim());
    start = selector.indexOf(GLOBAL_PSEUDO_OPEN, close + 1);
  }

  return payloads;
}

/**
 * Extract a camelCase class name from a CSS selector, or `null` if the selector has no RN
 * equivalent (pseudo-classes/-elements, bare element selectors, the universal selector — RN has
 * no element-selector concept, so those would just pollute the output).
 *
 * - `.card` → `'card'`
 * - `#header` → `'header'`
 * - `.btn.primary` → `'btnPrimary'` (compound)
 * - `.card .title` / `.card > .title` → `'cardTitle'` (descendant/child, flattened)
 * - `[data-theme]` → `'dataTheme'` (attribute)
 * - `.my-class-name` → `'myClassName'` (kebab → camel)
 * - `.card :global(.reset)` → `'cardReset'` (the `:global()` wrapper is erased, its payload kept)
 */
export function extractClassName(selector: string): string | null {
  const tokens = extractClassTokens(selector);
  return tokens === null ? null : joinClassTokens(tokens);
}

// The collapsed key is nothing but its tokens concatenated, so both forms come from ONE walk of
// the selector — a caller that scope-suffixes names needs the tokens, everything else needs the
// key, and two separate parsers would be two chances to disagree about what `.a\.b.c` means.
function joinClassTokens(tokens: string[]): string {
  return tokens.map((token, index) => (index === 0 ? token : capitalize(token))).join('');
}

/**
 * The individual camelCase class tokens a selector is built from — the un-collapsed form of
 * {@link extractClassName}. `.btn.primary` → `['btn', 'primary']`, `.card .title` →
 * `['card', 'title']`, `.card` → `['card']`; `null` on the same selectors extractClassName
 * rejects.
 *
 * Needed by every caller that scope-suffixes class names (Vue `<style scoped>`, a Svelte
 * `<style>` block): the markup those callers rewrite says `class="btn primary"`, so `btn` and
 * `primary` are the names they must recognize as locally defined — the collapsed `btnPrimary`
 * key appears nowhere in the markup and would leave both tokens unscoped.
 *
 * Tokens from inside a `:global(...)` are included here too, since the rule still only matches an
 * element carrying them. They are the ones a caller must NOT suffix, which is a distinction this
 * list does not carry — `globalClassTokensIn` (../global-selectors.ts) is where it lives.
 */
export function extractClassTokens(selector: string): string[] | null {
  // Erased first, ahead of every guard below: `:global(...)` legitimately carries a colon that
  // the pseudo-class guards would otherwise trip over, and its payload has to reach the shape
  // checks as ordinary selector text.
  const trimmed = stripGlobalWrappers(selector.trim()).trim();

  if (/^[a-z]+$/i.test(trimmed)) return null;
  if (trimmed === '*') return null;

  if (trimmed.startsWith(':')) return null;

  // A pseudo-class/-element trailing a class/id selector (`.card:hover`, `.card::before`) has
  // no RN equivalent — RN has no hover/focus/nth-child style variants — so the WHOLE rule is
  // dropped, same as a bare `:hover`. Stripping just the pseudo suffix and keeping `.card`'s
  // other declarations would be wrong: it'd silently merge hover-only styles into the
  // always-applied base style (a real gap an earlier version of this fix had — found by
  // manually running the parser on `.card:hover { opacity: 0.5 }` and seeing `opacity` leak
  // into `card`'s permanent style). `[...]` is excluded first since an attribute selector's
  // value may legitimately contain a colon (`[data-x="a:b"]`).
  if (trimmed.replace(/\[[^\]]*\]/g, '').includes(':')) return null;

  // Compound selector (`.btn.primary`, `div.card`) — split on unescaped dots.
  if (trimmed.includes('.') && !trimmed.includes(' ') && !trimmed.includes('>')) {
    const parts = trimmed.split(/(?<!\\)\./).filter(Boolean);
    if (parts.length > 0) {
      const startsWithElement = !trimmed.startsWith('.');
      const startIndex = startsWithElement ? 1 : 0;
      if (startIndex >= parts.length) return null;

      return parts.slice(startIndex).map(part => kebabToCamel(unescapeIdentifier(part)));
    }
  }

  // Descendant/child selector (`.card .title`, `.card > .title`) — flattened into one name.
  if (trimmed.includes(' ')) {
    const parts = trimmed.split(/\s+(?:>\s*)?/).filter(Boolean);
    const classNames: string[] = [];

    for (const part of parts) {
      // Every class of the part, not just the first: a chain link may itself be compound
      // (`.card .btn.primary`, and now `.card :global(.btn.primary)` after the erase above), and
      // an element has to carry BOTH names for the rule to apply. Taking only `.btn` would
      // register the rule under a key that a `class="btn primary"` element never resolves to.
      const classMatches = [...part.matchAll(/\.((?:[a-zA-Z0-9_-]|\\.)+)/g)];
      if (classMatches.length > 0) {
        for (const match of classMatches) {
          if (match[1]) classNames.push(unescapeIdentifier(match[1]));
        }
        continue;
      }
      const idMatch = part.match(/#((?:[a-zA-Z0-9_-]|\\.)+)/);
      if (idMatch?.[1]) classNames.push(unescapeIdentifier(idMatch[1]));
    }

    if (classNames.length === 0) return null;
    return classNames.map(name => kebabToCamel(name));
  }

  // Single class selector (`.card`).
  const classMatch = trimmed.match(/^\.((?:[a-zA-Z0-9_-]|\\.)+)/);
  if (classMatch?.[1]) return [kebabToCamel(unescapeIdentifier(classMatch[1]))];

  // ID selector (`#header`).
  const idMatch = trimmed.match(/^#((?:[a-zA-Z0-9_-]|\\.)+)/);
  if (idMatch?.[1]) return [kebabToCamel(unescapeIdentifier(idMatch[1]))];

  // Attribute selector (`[data-theme]`).
  const attrMatch = trimmed.match(/^\[([a-zA-Z0-9_-]+)(?:=[^\]]+)?\]/);
  if (attrMatch?.[1]) return [kebabToCamel(attrMatch[1])];

  return null;
}

/**
 * Every registered class key in a stylesheet, mapped back to the class tokens it was built from
 * (`.card.big { }` → `cardBig` → `['card', 'big']`). Build-time only, same as {@link parseCSS},
 * whose rule walk this mirrors — at-rules are dropped first for the same reason, silently here
 * since parseCSS already warns about them on its own pass.
 */
export function classTokensIn(css: string, options?: ICssParserOptions): Map<string, string[]> {
  const tokensByName = new Map<string, string[]>();
  if (!css || typeof css !== 'string') return tokensByName;

  const root = postcss.parse(css, { from: options?.filename });
  root.walkAtRules(atRule => {
    atRule.remove();
  });
  root.walkRules(rule => {
    for (const selector of rule.selector.split(',')) {
      const tokens = extractClassTokens(selector.trim());
      if (tokens === null || tokens.length === 0) continue;
      tokensByName.set(joinClassTokens(tokens), tokens);
    }
  });

  return tokensByName;
}

//#endregion Selector utilities

//#region var() resolution

function resolveVariables(value: string, variables: Map<string, string>): string {
  if (!value.includes('var(')) return value;

  const parsed = valueParser(value);
  parsed.walk((node, index, nodes) => {
    if (node.type !== 'function' || node.value !== 'var' || node.nodes.length === 0) return;

    const varName = node.nodes[0]?.value;
    if (!varName) return;
    const fallbackNode = node.nodes.length > 2 ? node.nodes[2] : undefined;
    const resolved = variables.get(varName) ?? fallbackNode?.value ?? '';
    if (!resolved) return;

    // Replace the `var(...)` function node in its containing array with a plain word node
    // holding the resolved text, instead of mutating `node`'s discriminated `type` in place.
    nodes[index] = {
      type: 'word',
      value: resolveVariables(resolved, variables),
      sourceIndex: node.sourceIndex,
      sourceEndIndex: node.sourceEndIndex,
    };
  });

  return parsed.toString();
}

//#endregion var() resolution

//#region calc() evaluation

const CALC_TERM_PATTERN = /calc\(([^)]+)\)/g;
const NUMBER_WITH_UNIT_PATTERN = /(-?\d+(?:\.\d+)?)(rem|em|px)?/g;

/**
 * Evaluates a narrow shape of `calc()`: a single multiplication, or the first numeric term
 * as a fallback. `px` is identity; `rem`/`em` scale by {@link REM_TO_PX}, matching a bare
 * dimension value.
 */
function evaluateCalc(value: string): string {
  if (!value.includes('calc(')) return value;

  return value.replace(CALC_TERM_PATTERN, (_, expr: string) => {
    const matches = expr.match(NUMBER_WITH_UNIT_PATTERN) ?? [];
    const values: number[] = [];

    for (const term of matches) {
      const numMatch = term.match(/(-?\d+(?:\.\d+)?)(rem|em|px)?/);
      if (!numMatch) continue;
      const amount = parseFloat(numMatch[1]!);
      const unit = numMatch[2];
      values.push(unit === 'rem' || unit === 'em' ? amount * REM_TO_PX : amount);
    }

    if (expr.includes('*')) {
      const parts = expr.split('*').map(part => part.trim());
      if (parts.length === 2) {
        const a = values[0] ?? parseFloat(parts[0]!) ?? 0;
        const b = parseFloat(parts[1]!) || 1;
        return String(Math.round(a * b));
      }
    }

    return String(Math.round(values[0] ?? 0));
  });
}

//#endregion calc() evaluation

/**
 * Parse a plain CSS string into a `{ className: RNStyleObject }` map. Build-time only — never
 * ship this in the app's native JS bundle; it is meant to run inside a Metro transformer.
 */
export function parseCSS(
  css: string,
  options?: ICssParserOptions,
): Record<string, Record<string, unknown>> {
  if (!css || typeof css !== 'string') return {};

  const root = postcss.parse(css, { from: options?.filename });
  const styles: Record<string, Record<string, unknown>> = {};
  const warnedProperties = new Set<string>();

  // `@media` (and any other at-rule) is unsupported; drop it before the rule walk below so its
  // nested rules never leak into the output.
  root.walkAtRules(atRule => {
    console.warn(
      `[@symbiote-native/css-parser] "@${atRule.name}" at-rules are not supported, "@${atRule.name} ${atRule.params}" skipped`,
    );
    atRule.remove();
  });

  const variables = new Map<string, string>();
  root.walkDecls(decl => {
    if (decl.prop.startsWith('--')) variables.set(decl.prop, decl.value);
  });

  root.walkRules(rule => {
    const selectors = rule.selector.split(',').map(selector => selector.trim());

    for (const selector of selectors) {
      const className = extractClassName(selector);
      if (!className) continue;

      const style: Record<string, unknown> = {};
      rule.walkDecls(decl => {
        if (decl.prop.startsWith('--')) return;

        const resolvedValue = evaluateCalc(resolveVariables(decl.value, variables));
        const mapped = mapCSSProperty(decl.prop.toLowerCase(), resolvedValue, warnedProperties);
        if (mapped) Object.assign(style, mapped);
      });

      if (Object.keys(style).length === 0) continue;
      styles[className] = { ...styles[className], ...style };
    }
  });

  return styles;
}
