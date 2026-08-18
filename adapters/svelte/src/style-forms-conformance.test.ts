// Every `<style>` form a Svelte component can carry, driven END TO END: real preprocessor ->
// real `svelte/compiler` -> the engine's real `registerRules` -> `resolveClassName` called with
// the EXACT token string the compiled markup carries.
//
// WHY THIS FILE EXISTS NEXT TO TWO OTHERS THAT ALREADY TOUCH SCOPING. Its claim is the one
// neither of them makes: that the two halves of the pass AGREE. `preprocessor/
// scoped-styles.test.ts` asserts on the rewritten TEXT (both halves read from the same assertion
// literal, so a shared mistake is invisible), and `components/scoped-styles.smoke.test.ts` mounts
// a handful of shapes but invents nothing about the rest. Here the registry is fed ONLY from the
// emitted `registerRules([...])` argument and queried ONLY with the class string parsed back out
// of the emitted component body — nothing is retyped by hand, so a scoper/compiler disagreement
// on ANY form in the matrix below fails the cell instead of hiding in a matching typo.
//
// Svelte scopes by default, so this is the most-used shape in the adapter and every cell of the
// matrix is real app surface, not an edge case.
//
// Cells that are pinned as WRONG rather than fixed carry a `KNOWN` comment naming the defect —
// see the report accompanying this file. Nothing here is a snapshot; every expectation is an
// explicit literal.

import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearGlobalStyles,
  registerRules,
  resolveClassName,
  type IStyleRule,
} from '@symbiote-native/engine';
import { scopedStyles } from './preprocessor/scoped-styles';
import { scopeSvelteClass } from './style-scope';

// The transformer is a hand-authored CommonJS file Metro `require()`s directly, so it is loaded
// the same way here rather than imported — this is the exact entry point Metro calls.
type ICompileSvelteFile = (source: string, filename: string) => string;

function isCompileSvelteFile(value: unknown): value is ICompileSvelteFile {
  return typeof value === 'function';
}

function loadCompileSvelteFile(): ICompileSvelteFile {
  const module: unknown = createRequire(import.meta.url)(
    '../metro-svelte-transformer.cjs',
  );
  if (typeof module !== 'object' || module === null) {
    throw new Error('metro-svelte-transformer.cjs exported no module object');
  }
  const compile = Reflect.get(module, 'compileSvelteFile');
  if (!isCompileSvelteFile(compile)) {
    throw new Error(
      'metro-svelte-transformer.cjs exports no compileSvelteFile',
    );
  }
  return compile;
}

const compileSvelteFile = loadCompileSvelteFile();
const preprocess = scopedStyles();

const FILENAME = '/repo/src/Card.svelte';
const OTHER_FILENAME = '/repo/src/Other.svelte';

// ---------------------------------------------------------------------------------------------
// Reading the compiled module back. Everything below is parsed OUT of the emitted JavaScript —
// no test-side knowledge of the scope hash, the registered keys, or the rewritten tokens.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSpecificity(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(part => typeof part === 'number')
  );
}

function isStyleRule(value: unknown): value is IStyleRule {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.tokens) &&
    value.tokens.every(token => typeof token === 'string') &&
    isSpecificity(value.specificity) &&
    typeof value.order === 'number' &&
    isRecord(value.style)
  );
}

function isRuleArray(value: unknown): value is IStyleRule[] {
  return Array.isArray(value) && value.every(isStyleRule);
}

function isNamePairArray(value: unknown): value is Array<[string, string]> {
  return (
    Array.isArray(value) &&
    value.every(
      pair =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        pair.every(item => typeof item === 'string'),
    )
  );
}

const REGISTER_CALL = '__symbioteRegisterRules(';

// The emitted argument is a JSON-shaped array of rules, so the balanced-bracket slice parses as
// JSON directly. Sliced rather than regex-matched because a rule's `style` nests one level.
function registeredRules(code: string): IStyleRule[] {
  const call = code.indexOf(REGISTER_CALL);
  if (call < 0) return [];
  const start = call + REGISTER_CALL.length;
  let depth = 0;
  for (let index = start; index < code.length; index += 1) {
    if (code[index] === '[') depth += 1;
    else if (code[index] === ']') {
      depth -= 1;
      if (depth > 0) continue;
      const parsed: unknown = JSON.parse(code.slice(start, index + 1));
      if (!isRuleArray(parsed)) {
        throw new Error(`registerRules argument is not a rule array: ${code}`);
      }
      return parsed;
    }
  }
  throw new Error(`unbalanced registerRules argument in:\n${code}`);
}

// A component prop compiles to `View($$anchor, { class: '…' })`; a host element compiles to
// `$.set_class(node, 1, '…', …)`. Both forms are read so the host-element cell can assert on the
// same footing as the component ones.
const STATIC_CLASS_PATTERN =
  /(?:\bclass: |\$\.set_class\([^,]+, \d+, )'([^']*)'/g;

function staticClassNames(code: string): string[] {
  return [...code.matchAll(STATIC_CLASS_PATTERN)].map(match => match[1]);
}

function onlyStaticClassName(code: string): string {
  const names = staticClassNames(code);
  if (names.length !== 1) {
    throw new Error(`expected one static class, got ${names.length}:\n${code}`);
  }
  return names[0];
}

const SCOPED_NAMES_PATTERN =
  /__symbioteScopedNames = new Map\((\[[\s\S]*?\])\)/;

// The name map a dynamic `class={expr}` is compiled to call `scopeSvelteClass` with — authored
// name -> the name lightningcss renamed it to. Read out of the emitted module for the same reason
// as everything else: the runtime half must be exercised with the build half's own values, never
// with values the test invented. It is also the only place a cell can learn a scoped name from,
// now that no scope id is emitted on its own.
function scopedNamesOf(code: string): ReadonlyMap<string, string> {
  const match = SCOPED_NAMES_PATTERN.exec(code);
  if (match === null) {
    throw new Error(`no scope constants emitted in:\n${code}`);
  }
  const parsed: unknown = JSON.parse(match[1]);
  if (!isNamePairArray(parsed)) {
    throw new Error(`scoped names are not name pairs: ${match[1]}`);
  }
  return new Map(parsed);
}

function scopedName(names: ReadonlyMap<string, string>, local: string): string {
  const scoped = names.get(local);
  if (scoped === undefined) {
    throw new Error(`\`${local}\` is not in the emitted name map`);
  }
  return scoped;
}

// The whole chain in one call: preprocess -> compile -> feed the emitted styles into the REAL
// registry. Returns the compiled module text so each cell reads its own class token out of it.
async function driveToRegistry(
  source: string,
  filename = FILENAME,
): Promise<string> {
  const { code } = await preprocess.markup({ content: source, filename });
  const compiled = compileSvelteFile(code, filename);
  registerRules(registeredRules(compiled));
  return compiled;
}

beforeEach(() => {
  clearGlobalStyles();
});

describe('Svelte style forms — compiled markup vs. registered styles', () => {
  describe('Positive — a scoped class resolves to its own declarations', () => {
    // why: the baseline. A default (scoped) <style> block is the shape every other cell varies,
    // and it is the one that proves the suffix the markup carries is the suffix the registry was
    // keyed under — not merely that both look like `svelte-<hash>`.
    it('resolves a plain single class in a default <style> block', async () => {
      const code = await driveToRegistry(
        '<View class="card" />\n<style>\n  .card { padding: 12px; }\n</style>\n',
      );

      expect(resolveClassName(onlyStaticClassName(code))).toEqual({
        padding: 12,
      });
    });

    // why: markup writes kebab, the registry is keyed camelCase — the rewrite has to normalize or
    // the token and the key are two different strings that both look right in isolation.
    it('resolves a kebab-case class the registry keyed camelCase', async () => {
      const code = await driveToRegistry(
        '<View class="card-title" />\n<style>\n  .card-title { padding: 5px; }\n</style>\n',
      );

      expect(resolveClassName(onlyStaticClassName(code))).toEqual({
        padding: 5,
      });
    });

    // why: scoping is per FILE. Two components each defining `.card` share one flat global Map,
    // so a scope-id collision would let the second silently overwrite the first — with no build
    // error and no warning anywhere.
    it('keeps two files defining the same class name apart', async () => {
      const first = await driveToRegistry(
        '<View class="card" />\n<style>.card { padding: 1px; }</style>\n',
        FILENAME,
      );
      const second = await driveToRegistry(
        '<View class="card" />\n<style>.card { padding: 2px; }</style>\n',
        OTHER_FILENAME,
      );

      expect(resolveClassName(onlyStaticClassName(first))).toEqual({
        padding: 1,
      });
      expect(resolveClassName(onlyStaticClassName(second))).toEqual({
        padding: 2,
      });
    });
  });

  describe('Positive — compound rules (P0 for this project)', () => {
    // why: `.card.big` collapses to ONE registered key (`cardBig__<scope>`) that appears nowhere
    // in the markup, which carries two separately-suffixed tokens. The two operations do not
    // commute, so this is the cell where a scope-suffix scheme change breaks first — and it must
    // LAYER over `.card`, not replace it.
    it('layers a compound rule over the single-class rule it shares a token with', async () => {
      const code = await driveToRegistry(
        '<View class="card big" />\n' +
          '<style>\n  .card { padding: 4px; margin: 2px; }\n  .card.big { padding: 16px; }\n</style>\n',
      );

      expect(resolveClassName(onlyStaticClassName(code))).toEqual({
        padding: 16,
        margin: 2,
      });
    });

    // why: `big` has no standalone rule at all, so nothing but the compound records it — if only
    // the collapsed key were recorded as local, `big` would ship unscoped and the rule would be
    // permanently unreachable from markup.
    it('reaches a compound whose tokens have no standalone rule of their own', async () => {
      const code = await driveToRegistry(
        '<View class="card big" />\n<style>\n  .card.big { padding: 16px; }\n</style>\n',
      );

      expect(resolveClassName(onlyStaticClassName(code))).toEqual({
        padding: 16,
      });
    });

    // why: the flip side of the cell above — the compound must NOT leak onto an element carrying
    // only one of its tokens. Asserted on the token the compiled markup actually emits, split
    // back out of it, so this cannot drift from the cell above.
    it('does not apply a compound to an element carrying only one of its tokens', async () => {
      const code = await driveToRegistry(
        '<View class="card big" />\n<style>\n  .card.big { padding: 16px; }\n</style>\n',
      );
      const [cardToken] = onlyStaticClassName(code).split(' ');

      expect(resolveClassName(cardToken)).toEqual({});
    });

    // why: three tokens is where a rule stops being a pair — the compiler has to emit all three
    // and the element has to carry all three for the subset test to fire.
    it('reaches a three-token compound', async () => {
      const code = await driveToRegistry(
        '<View class="alpha beta gamma" />\n<style>\n  .alpha.beta.gamma { padding: 3px; }\n</style>\n',
      );

      expect(resolveClassName(onlyStaticClassName(code))).toEqual({
        padding: 3,
      });
    });
  });

  describe('Positive — :global() escape hatches', () => {
    // why: a whole-selector :global() must register UNSUFFIXED and leave its markup token alone,
    // or a class meant to be shared across files silently becomes file-local.
    it('keeps a whole :global() selector out of the scope on both sides', async () => {
      const code = await driveToRegistry(
        '<View class="reset card" />\n' +
          '<style>\n  :global(.reset) { margin: 0; }\n  .card { padding: 2px; }\n</style>\n',
      );
      const className = onlyStaticClassName(code);

      expect(className).toBe(`reset ${className.split(' ')[1]}`);
      expect(resolveClassName(className)).toEqual({ margin: 0, padding: 2 });
    });

    // why: `.card :global(.legacy)` reaches markup this file does not own. The collapsed KEY is
    // scoped (its `.card` half is this file's) while the `legacy` MARKUP token must not be —
    // suffixing it too would scope-mangle the escape hatch into matching nothing.
    //
    // KNOWN — the rule fires as a COMPOUND, not as the descendant it was written as: every
    // combinator collapses into one key (`.claude/rules/style-registry-collisions.md`, sixth
    // trap). Pinned as-is because that is a parser-wide defect, not a Svelte one.
    it('scopes the collapsed key of a partial :global() but not its foreign token', async () => {
      const code = await driveToRegistry(
        '<View class="card legacy" />\n' +
          '<style>\n  .card { padding: 2px; }\n  .card :global(.legacy) { margin: 3px; }\n</style>\n',
      );
      const className = onlyStaticClassName(code);

      expect(className.split(' ')[1]).toBe('legacy');
      expect(resolveClassName(className)).toEqual({ padding: 2, margin: 3 });
    });
  });

  describe('Positive — dynamic class values', () => {
    // why: a `class={expr}` has no tokens at build time, so the rewrite wraps it in a runtime
    // call. Build and runtime therefore apply the rule TWICE, in two files — this cell runs the
    // real runtime helper with the real emitted constants, which is the only way the two are
    // shown to agree.
    it('scopes a dynamic string expression through the emitted runtime call', async () => {
      const code = await driveToRegistry(
        '<script>let extra = "big";</script>\n<View class={extra} />\n' +
          '<style>\n  .card { padding: 2px; }\n  .big { padding: 9px; }\n</style>\n',
      );
      const names = scopedNamesOf(code);

      expect(code).toContain('__symbioteScopeClass(extra');
      expect(resolveClassName(scopeSvelteClass('big', names))).toEqual({
        padding: 9,
      });
    });

    // why: the clsx array is the idiomatic Svelte form and leaves a literal `false` in the array,
    // which is exactly the shape the engine's own scoper throws on — the adapter's normalization
    // boundary has to run first.
    it('scopes a clsx array through the emitted runtime call', async () => {
      const code = await driveToRegistry(
        '<script>let on = true;</script>\n<View class={["card", on && "big"]} />\n' +
          '<style>\n  .card { margin: 2px; }\n  .card.big { padding: 9px; }\n</style>\n',
      );
      const names = scopedNamesOf(code);

      // The two values `['card', on && 'big']` actually evaluates to, on and off.
      expect(
        resolveClassName(scopeSvelteClass(['card', 'big'], names)),
      ).toEqual({ margin: 2, padding: 9 });
      expect(
        resolveClassName(scopeSvelteClass(['card', false], names)),
      ).toEqual({ margin: 2 });
    });

    // why: an interpolated value is neither fully static nor a lone expression — it is rebuilt as
    // a template literal, so the static half must still end up scoped by the SAME rule.
    it('scopes an interpolated class value', async () => {
      const code = await driveToRegistry(
        '<script>let extra = "big";</script>\n<View class="card {extra}" />\n' +
          '<style>\n  .card { margin: 2px; }\n  .big { padding: 9px; }\n</style>\n',
      );
      const names = scopedNamesOf(code);

      expect(resolveClassName(scopeSvelteClass('card big', names))).toEqual({
        margin: 2,
        padding: 9,
      });
    });
  });

  describe('Positive — markup and stylesheet disagreeing about which classes exist', () => {
    // why: Svelte's own compiler PRUNES a selector it cannot see used and warns `css_unused_
    // selector`. This pass deletes the <style> block before the compiler ever sees it, so nothing
    // prunes — a rule only a sibling component uses must still register, or forwarding a class
    // down would silently paint nothing.
    it('registers a class the markup never mentions', async () => {
      const code = await driveToRegistry(
        '<View class="card" />\n' +
          '<style>\n  .card { padding: 2px; }\n  .unused { padding: 7px; }\n</style>\n',
      );
      const names = scopedNamesOf(code);

      expect(resolveClassName(scopedName(names, 'unused'))).toEqual({
        padding: 7,
      });
    });

    // why: the converse. An unknown token must contribute nothing and must not stop the tokens
    // around it from resolving — the registry is queried with the whole space-separated string.
    it('ignores a markup class the stylesheet never declares', async () => {
      const code = await driveToRegistry(
        '<View class="ghost card" />\n<style>\n  .card { padding: 2px; }\n</style>\n',
      );
      const className = onlyStaticClassName(code);

      expect(className.split(' ')[0]).toBe('ghost');
      expect(resolveClassName(className)).toEqual({ padding: 2 });
    });

    // why: the realistic mix — one foreign token, one :global() token, one scoped token on the
    // same element. Only the last may carry a suffix.
    it('scopes only the local token of a mixed class list', async () => {
      const code = await driveToRegistry(
        '<View class="ghost reset card" />\n' +
          '<style>\n  :global(.reset) { margin: 0; }\n  .card { padding: 2px; }\n</style>\n',
      );
      const className = onlyStaticClassName(code);
      const names = scopedNamesOf(code);

      expect(className).toBe(`ghost reset ${scopedName(names, 'card')}`);
      expect(resolveClassName(className)).toEqual({ margin: 0, padding: 2 });
    });
  });

  describe('Not supported — forms the pass deliberately or provably does not cover', () => {
    // why: `class:foo={cond}` is the one Svelte class form with no equivalent here. On a
    // COMPONENT — which is all app code ever writes, since authoring a host tag is forbidden —
    // Svelte itself rejects it before this pass matters. Pinned so the day Svelte allows it, this
    // cell fails and the scoper gets taught the directive rather than shipping it unscoped.
    it('rejects a class: directive on a component, in the compiler', async () => {
      const { code } = await preprocess.markup({
        content:
          '<script>let on = true;</script>\n<View class="card" class:lit={on} />\n' +
          '<style>\n  .card { padding: 2px; }\n  .lit { opacity: 1; }\n</style>\n',
        filename: FILENAME,
      });

      expect(() => compileSvelteFile(code, FILENAME)).toThrow(
        /component_invalid_directive/,
      );
    });

    // why: `class:foo={cond}` names its class in the DIRECTIVE, where the class-attribute rewrite
    // cannot see it — it shipped unscoped until 2026-08-20 while the stylesheet registered the
    // scoped name, so the rule was unreachable. Only a host element can carry the form (Svelte
    // rejects it on a component, the cell above), which makes this the one place it is testable.
    it('scopes a class: directive token on a host element', async () => {
      const code = await driveToRegistry(
        '<script>let on = true;</script>\n' +
          '<symbiote-view class="card" class:lit={on}></symbiote-view>\n' +
          '<style>\n  .card { padding: 2px; }\n  .lit { opacity: 1; }\n</style>\n',
      );
      const lit = scopedName(scopedNamesOf(code), 'lit');

      expect(code).toContain(`{ '${lit}': on }`);
      expect(resolveClassName(lit)).toEqual({ opacity: 1 });
    });
  });

  // Every one of these is a language whose syntax is NOT valid CSS. Until 2026-08-20 the block
  // was located with `svelte/compiler`'s `parse()`, which validates <style> content as CSS
  // whatever `lang` says, so a `$variable` threw `css_expected_identifier` and only the subset of
  // SCSS that happens to be legal CSS (nesting) worked. The block is cut out textually now, the
  // way svelte's own `preprocess()` does it, so the language table is actually reachable.
  describe('Positive — <style lang> preprocessors', () => {
    it('compiles a SCSS variable', async () => {
      const code = await driveToRegistry(
        '<View class="card" />\n' +
          '<style lang="scss">\n$pad: 7px;\n.card { padding: $pad; }\n</style>\n',
      );

      expect(resolveClassName(onlyStaticClassName(code))).toEqual({
        padding: 7,
      });
    });

    it('compiles nested SCSS', async () => {
      const code = await driveToRegistry(
        '<View class="card" />\n' +
          '<style lang="scss">\n  .card { padding: 3px; .inner { padding: 1px; } }\n</style>\n',
      );

      expect(resolveClassName(onlyStaticClassName(code))).toEqual({
        padding: 3,
      });
    });

    // Sass's indented syntax has no braces at all, so nothing about it could pass as CSS.
    it('compiles indented Sass', async () => {
      const code = await driveToRegistry(
        '<View class="card" />\n' +
          '<style lang="sass">\n$pad: 6px\n.card\n  padding: $pad\n</style>\n',
      );

      expect(resolveClassName(onlyStaticClassName(code))).toEqual({
        padding: 6,
      });
    });

    // Less is missing from this matrix on purpose: it cannot run in the `svelte` vitest project,
    // which sets the `browser` resolve condition that makes `less` load its browser bundle and
    // throw `window is not defined`. Its cell lives in
    // core/css-parser/src/svelte-less-style-block.test.ts, on the same preprocessor.

    it('compiles a Stylus variable', async () => {
      const code = await driveToRegistry(
        '<View class="card" />\n' +
          '<style lang="stylus">\npad = 4px\n.card\n  padding pad\n</style>\n',
      );

      expect(resolveClassName(onlyStaticClassName(code))).toEqual({
        padding: 4,
      });
    });
  });
});
