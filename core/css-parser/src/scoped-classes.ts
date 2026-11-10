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
import type { ICompiledProperty } from '@symbiote-native/engine';
import type { IMediaCondition } from './lightning/media.ts';
import {
  compileCssToRules,
  type IRootVariable,
  type IStyleRule,
} from './lightning/rules.ts';

export type IScopedCss = {
  readonly rules: readonly IStyleRule[];
  /** Authored class name -> the name it registers under. */
  readonly names: ReadonlyMap<string, string>;
  /** The `@media` conditions the rules' `cond` indices point into. */
  readonly conditions: readonly IMediaCondition[];
  /** The `:root` custom properties, whose `cond` indices point into the same table */
  readonly rootVariables: readonly IRootVariable[];
  /** The `@property` rules, whose `cond` indices point into the same table */
  readonly properties: readonly ICompiledProperty[];
};

export type IScopedCssOptions = {
  readonly filename: string;
  /** A lightningcss CSS-Modules pattern, `[local]` first — see the table above. */
  readonly pattern: string;
};

/**
 * A scoped style block (a Svelte `<style>`, a Vue `<style scoped>`) compiled for the registry
 * It returns the rules under their scoped names and the name map the markup rewriter resolves
 * class tokens through, both out of one `compileCssToRules` call
 */
export function compileScopedCss(
  css: string,
  options: IScopedCssOptions,
): IScopedCss {
  const compiled = compileCssToRules(css, options);
  return {
    rules: compiled.rules,
    names: new Map(Object.entries(compiled.exports)),
    conditions: compiled.conditions,
    rootVariables: compiled.rootVariables,
    properties: compiled.properties,
  };
}
