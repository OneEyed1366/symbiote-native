// What a caller doing its own scope-suffixing (Vue's <style scoped>/<style module>, Svelte's
// <style>, a standalone .module.css file) must leave alone because the author wrote `:global(...)`
// around it. parseCSS's output cannot answer that on its own: extractClassName UNWRAPS `:global()`
// (so `:global(.reset)` parses to the same `reset` key a plain `.reset` would) and its return
// shape is deliberately just `{ className: style }`, with no per-key metadata.
//
// The escape hatch is asked about at TWO levels, and they are genuinely different questions:
//
//   :global(.reset)        key `reset`      — the whole selector is outside the scope
//   .card :global(.reset)  key `cardReset`  — only the `reset` TOKEN is
//
// `globalClassNamesIn` answers the first (which registered KEY stays unsuffixed),
// `globalClassTokensIn` the second (which MARKUP token stays unsuffixed). A partial `:global()`
// needs both to disagree: the rule as a whole is scoped, because `.card` is the file's own, yet
// the `reset` half must reach the unscoped markup it was written for. Suffixing it anyway
// scope-mangles the author's escape hatch into something that matches nothing.
//
// Both walk the selectors through the parser's own tokenizer rather than a private regex — the
// names they hand back are compared against parseCSS's keys and against the markup tokens
// classTokensIn produces, so any independent spelling of "what class does this selector name" is
// one more chance to disagree with the pipeline it feeds.
import postcss from 'postcss';
import {
  extractClassName,
  extractClassTokens,
  globalPayloadsIn,
  type ICssParserOptions,
} from './parser/index.ts';

function eachSelector(
  css: string,
  options: ICssParserOptions | undefined,
  visit: (selector: string) => void,
): void {
  if (!css || typeof css !== 'string') return;

  const root = postcss.parse(css, { from: options?.filename });
  // Dropped ahead of the rule walk for the same reason parseCSS drops them, silently here since
  // that pass already warned about each one.
  root.walkAtRules(atRule => {
    atRule.remove();
  });
  root.walkRules(rule => {
    for (const selector of rule.selector.split(',')) visit(selector.trim());
  });
}

// In source order, so a caller can compare this list against the selector's full token list
// position by position.
function globalTokensOf(selector: string): string[] {
  const tokens: string[] = [];
  for (const payload of globalPayloadsIn(selector)) {
    for (const token of extractClassTokens(payload) ?? []) tokens.push(token);
  }
  return tokens;
}

/**
 * The registered keys whose ENTIRE selector lived outside the file's scope — `:global(.reset)` →
 * `reset`, `:global(.btn.primary)` → `btnPrimary`. These register under their plain name and get
 * no scope suffix.
 *
 * A selector with a scoped part (`.card :global(.reset)` → `cardReset`) is deliberately absent:
 * the rule still only applies where the file's own `.card` does, so its collapsed key belongs to
 * this file. Only its `:global()` half escapes, which is {@link globalClassTokensIn}'s answer.
 */
export function globalClassNamesIn(css: string, options?: ICssParserOptions): Set<string> {
  const names = new Set<string>();

  eachSelector(css, options, selector => {
    const tokens = extractClassTokens(selector);
    if (tokens === null) return;

    // Compared position by position rather than as a subset: `.card :global(.card)` repeats a
    // token, and "every token appears somewhere in a payload" would read that as fully global.
    const globalTokens = globalTokensOf(selector);
    if (globalTokens.length !== tokens.length) return;
    if (!tokens.every((token, index) => token === globalTokens[index])) return;

    const name = extractClassName(selector);
    if (name !== null) names.add(name);
  });

  return names;
}

/**
 * Every class token that came out of a `:global(...)` payload, wherever in a selector it sat —
 * `.card :global(.legacy-widget) span` → `{ legacyWidget }`.
 *
 * This is the set a scope-suffixing caller subtracts from the tokens it owns. A token is in it
 * whether or not the selector around it was scoped, which is the whole point: the author reached
 * for `:global()` precisely because that name is spelled the same way in markup this file does
 * not own, and a suffix would break the match it was reaching for.
 *
 * A selector the parser rejects contributes nothing — it registers no key, so it names nothing to
 * exempt, and letting its payload leak in here would unscope a token some other rule legitimately
 * owns.
 */
export function globalClassTokensIn(css: string, options?: ICssParserOptions): Set<string> {
  const tokens = new Set<string>();

  eachSelector(css, options, selector => {
    if (extractClassTokens(selector) === null) return;
    for (const token of globalTokensOf(selector)) tokens.add(token);
  });

  return tokens;
}
