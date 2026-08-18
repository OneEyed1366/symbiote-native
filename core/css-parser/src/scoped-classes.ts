// The ONE class-renaming call in this repo. Every scoping shape we have is the same lightningcss
// CSS-Modules rename with a different suffix, so none of them owns a loop of its own:
//
//   standalone .module.*   [local]__module__<hash>     metro-css-module/index.ts
//   Vue <style module>     [local]__module__<hash>
//   Vue <style scoped>     [local]__data-v-<hash>
//   Svelte <style>         [local]__svelte-<hash>      adapters/svelte/src/preprocessor
//
// The rename is not the point — the name MAP is. A scoping pass has two halves (the registered
// style rules and the markup rewriter) and they must name a class identically; each half deriving
// the name for itself is the bug class this file exists to close. Both halves read `names` below.
// lightningcss also decides `:global()` for free: a name it did NOT rename is global, surfaced as
// `ICompiledCss.globals`, so nothing has to re-walk selectors hunting for the escape hatch.
//
// lightningcss is MPL-2.0 and this package is MIT. Depending on it is fine (file-level copyleft
// does not reach our files); NEVER vendor, copy, or patch its sources.
import { compileCssToRules, type IStyleRule } from './lightning/rules.ts';

export type IScopedCss = {
  readonly rules: readonly IStyleRule[];
  /** Authored class name -> the name it registers under. */
  readonly names: ReadonlyMap<string, string>;
};

export type IScopedCssOptions = {
  readonly filename: string;
  /** A lightningcss CSS-Modules pattern, `[local]` first — see the table above. */
  readonly pattern: string;
};

/**
 * A SCOPED style block (a Svelte `<style>`, a Vue `<style scoped>`) compiled for the registry:
 * the rules keyed under their scoped names, and the name map its markup rewriter resolves every
 * class token through.
 *
 * Both halves come out of ONE `compileCssToRules` call. The two-pass shape this used to have —
 * rename, then re-parse the ORIGINAL text and re-key it per token — existed only because the old
 * parser derived a key by camelCasing the selector, which mangled a scope tail whose base36 hash
 * started with a letter (`card__svelte-p4np8c` registered as `card__svelteP4np8c`). Nothing
 * camelCases any more, so there is nothing to work around.
 */
export function compileScopedCss(
  css: string,
  options: IScopedCssOptions,
): IScopedCss {
  const compiled = compileCssToRules(css, options);
  return {
    rules: compiled.rules,
    names: new Map(Object.entries(compiled.exports)),
  };
}
