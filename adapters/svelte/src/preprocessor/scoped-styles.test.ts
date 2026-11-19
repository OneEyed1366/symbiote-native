// The build-time half of `<style>` support: what the preprocessor hands to `compile()`
// The runtime proof lives in `../components/scoped-styles.smoke.test.ts`

// No Negative group in the usual sense, since the preprocessor rewrites or passes through
// Its one throwing path, an unsupported `<style lang>`, is grouped on its own below

import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { scopedStyles } from './scoped-styles';

const preprocess = scopedStyles();
const FILENAME = '/repo/src/Card.svelte';
const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

async function run(source: string, filename = FILENAME): Promise<string> {
  const { code } = await preprocess.markup({ content: source, filename });
  return code;
}

// The suffix is a hash of the file path, so tests assert on the shape rather than a literal.
const SCOPE_PATTERN = /svelte-[a-z0-9]+/;

function scopeIdOf(code: string): string {
  const match = SCOPE_PATTERN.exec(code);
  if (match === null) throw new Error(`no scope id in:\n${code}`);
  return match[0];
}

describe('scopedStyles preprocessor', () => {
  describe('Positive — no <style> block, or nothing to rewrite', () => {
    // why: the overwhelming majority of components have no <style> block; the preprocessor must
    // be a true no-op for them, not just "doesn't crash" — a stray byte here corrupts every
    // component in the app.
    it('leaves a component with no <style> block byte-identical', async () => {
      const source =
        '<script>let x = 1;</script>\n<View class="card">{x}</View>\n';
      expect(await run(source)).toBe(source);
    });

    // A class made only of `:global(...)` names has nothing of this file to rewrite
    // Re-quoting it would move offsets for no gain, the block itself is still registered
    it('leaves a class attribute untouched when nothing in it is locally scoped', async () => {
      const code = await run(
        '<View class="reset" />\n<style>:global(.reset) { margin: 0; }</style>\n',
      );
      expect(code).toContain('class="reset"');
      expect(code).toContain('"tokens":["reset"]');
    });
  });

  describe('Positive — a <style> block is registered and the markup rewritten', () => {
    it('registers the block under a per-file-suffixed key and rewrites the static class', async () => {
      const code = await run(
        '<View class="card" />\n<style>\n  .card { padding: 12px; }\n</style>\n',
      );
      const scopeId = scopeIdOf(code);

      expect(code).toContain(`class="card__${scopeId}"`);
      expect(code).toContain(
        `{"tokens":["card__${scopeId}"],"specificity":[0,1,0],"order":0,"style":{"padding":12}}`,
      );
      expect(code).toContain(
        "import { registerRules as __symbioteRegisterRules } from '@symbiote-native/engine'",
      );
      expect(code).not.toContain('<style');
      // `combinators` is compile-time-only — stripped rather than shipped in every app bundle.
      expect(code).not.toContain('combinators');
    });

    // A compound rule keeps the token set of its selector, each token renamed on its own
    // The registry then matches any element whose class list is a superset of that set
    it('scopes both tokens of a compound selector whose parts have no standalone rule', async () => {
      const code = await run(
        '<View class="card big" />\n<style>\n  .card.big { padding: 16px; }\n</style>\n',
      );
      const scopeId = scopeIdOf(code);

      expect(code).toContain(`class="card__${scopeId} big__${scopeId}"`);
      expect(code).toContain(
        `{"tokens":["card__${scopeId}","big__${scopeId}"],"specificity":[0,2,0],"order":0,"style":{"padding":16}}`,
      );
    });

    // why: scoping is per FILE — two files defining the same class name must not collide, or one
    // component's style would silently overwrite another's in the shared global registry.
    it('gives two different files two different scope ids for the same class name', async () => {
      const source =
        '<View class="card" />\n<style>.card { padding: 1px; }</style>\n';
      const first = scopeIdOf(await run(source, '/repo/src/A.svelte'));
      const second = scopeIdOf(await run(source, '/repo/src/B.svelte'));
      expect(first).not.toBe(second);
    });

    // `:global(...)` is the escape hatch out of file scoping, as in Vue's `<style scoped>`
    // It registers unsuffixed and its markup token stays, or a shared class turns file-local
    it('leaves a :global(...) selector unsuffixed and its markup token untouched', async () => {
      const code = await run(
        '<View class="reset card" />\n' +
          '<style>\n  :global(.reset) { margin: 0; }\n  .card { padding: 4px; }\n</style>\n',
      );
      const scopeId = scopeIdOf(code);

      expect(code).toContain(`class="reset card__${scopeId}"`);
      expect(code).toContain(
        '{"tokens":["reset"],"specificity":[0,1,0],"order":0,"style":{"margin":0}}',
      );
      expect(code).not.toContain(`reset__${scopeId}`);
    });

    // `:global()` around part of a selector reaches markup this file does not own
    // The markup token must stay unsuffixed too, or it matches nothing, the Vue suite pins the same
    it('leaves a partial :global() token unsuffixed while the rest of its chain is suffixed', async () => {
      const code = await run(
        '<View class="card legacy" />\n' +
          '<style>\n  .card { padding: 10px; }\n  .card :global(.legacy) { margin: 0; }\n</style>\n',
      );
      const scopeId = scopeIdOf(code);

      expect(code).toContain(`class="card__${scopeId} legacy"`);
      expect(code).not.toContain(`legacy__${scopeId}`);
      // Both rules survive registration: the descendant rule LAYERS over `.card` rather than
      // replacing it, so `.card`'s own declarations must still be there to layer under.
      expect(code).toContain(
        `{"tokens":["card__${scopeId}"],"specificity":[0,1,0],"order":0,"style":{"padding":10}}`,
      );
      // Per-token again: `.card` is renamed, the `:global()` half is not.
      expect(code).toContain(
        `{"tokens":["card__${scopeId}","legacy"],"specificity":[0,2,0],"order":1,"style":{"margin":0}}`,
      );
    });

    // why: the exemption must be surgical — a fully global selector still registers under its
    // plain name and an ordinary scoped one in the SAME block still gets its suffix. Widening the
    // token exemption into either of those would unscope the whole file.
    it('still suffixes an ordinary scoped class beside a fully global one in the same block', async () => {
      const code = await run(
        '<View class="card reset" />\n' +
          '<style>\n  .card { padding: 10px; }\n  :global(.reset) { margin: 0; }\n</style>\n',
      );
      const scopeId = scopeIdOf(code);

      expect(code).toContain(`class="card__${scopeId} reset"`);
      expect(code).toContain(
        `{"tokens":["card__${scopeId}"],"specificity":[0,1,0],"order":0,"style":{"padding":10}}`,
      );
      expect(code).toContain(
        '{"tokens":["reset"],"specificity":[0,1,0],"order":1,"style":{"margin":0}}',
      );
    });

    // why: a class token this file's <style> block never mentions (e.g. one a design-system
    // utility class registers elsewhere) must pass through untouched, not be silently dropped or
    // suffixed as if this file owned it.
    it('passes a class token this file does not define straight through', async () => {
      const code = await run(
        '<View class="card global-thing" />\n<style>.card { padding: 4px; }</style>\n',
      );
      expect(code).toContain(`class="card__${scopeIdOf(code)} global-thing"`);
    });

    // A kebab-authored class registers under its authored name, no `camelCase` step in either half
    // The markup token and the rule token must be one string, kebab included
    it('keeps a kebab-authored token kebab on both sides', async () => {
      const code = await run(
        '<View class="card-title" />\n<style>.card-title { color: red; }</style>\n',
      );
      const scopeId = scopeIdOf(code);
      expect(code).toContain(`class="card-title__${scopeId}"`);
      expect(code).toContain(`"tokens":["card-title__${scopeId}"]`);
    });

    // why: an empty static class attribute has zero tokens to scope — the fix has to leave it
    // alone rather than emit `class=""` as a needless rewrite.
    it('leaves an empty static class attribute untouched', async () => {
      const source =
        '<View class="" />\n<style>.card { padding: 4px; }</style>\n';
      const code = await run(source);
      expect(code).toContain('class=""');
    });

    // why: a dynamic class expression (clsx array, ternary, arbitrary call) cannot be resolved at
    // build time — the compiler cannot see into it — so it must be wrapped in the runtime scoper
    // VERBATIM rather than partially rewritten, or the expression's own logic breaks.
    it('wraps a dynamic class expression in the runtime scoper, verbatim', async () => {
      const code = await run(
        "<View class={['card', on && 'lit']} />\n<style>.card { padding: 4px; } .lit { color: red; }</style>\n",
      );
      const scopeId = scopeIdOf(code);

      expect(code).toContain(
        "class={__symbioteScopeClass(['card', on && 'lit'], __symbioteScopedNames)}",
      );
      // The map, not a name set plus a scope id: the runtime reads the name lightningcss gave
      // each class instead of re-deriving it from a suffix.
      expect(code).toContain(
        `const __symbioteScopedNames = new Map([["card","card__${scopeId}"],["lit","lit__${scopeId}"]])`,
      );
    });

    // why: an interpolated class="a {b} c" is the shape Svelte itself would concatenate at
    // runtime — rebuilding it as a template literal is the only way a single dynamic expression
    // can carry both the static tokens and the interpolated ones through the same scoper call.
    it('rebuilds an interpolated class as a template literal', async () => {
      const code = await run(
        '<View class="card {extra} tail" />\n<style>.card { padding: 4px; }</style>\n',
      );
      expect(code).toContain(
        'class={__symbioteScopeClass(`card ${extra} tail`, __symbioteScopedNames)}',
      );
    });

    // why: emitting a runtime call the file has nothing to scope against would be dead code
    // shipped into every bundle — when localNames is empty, no call, no constants, must exist.
    it('emits no runtime scoper when nothing in the file is locally scoped', async () => {
      const code = await run(
        '<View class={cls} />\n<style>:global(.reset) { margin: 0; }</style>\n',
      );
      expect(code).toContain('class={cls}');
      expect(code).not.toContain('__symbioteScopeClass');
      expect(code).toContain(
        '{"tokens":["reset"],"specificity":[0,1,0],"order":0,"style":{"margin":0}}',
      );
    });

    // why: the markup walk descends through every AST child value, not just the top-level
    // fragment — a class inside a control-flow block ({#each}/{#if}/snippet) must still resolve,
    // or scoping silently only works for top-level markup.
    it('scopes a class inside an {#each} body, not just at the top level', async () => {
      const code = await run(
        '{#each items as item}<View class="card">{item}</View>{/each}\n<style>.card { padding: 4px; }</style>\n',
      );
      expect(code).toContain(`class="card__${scopeIdOf(code)}"`);
    });

    // Svelte rejects a second `<script module>`, so the registration splices into an existing one
    // Duplicating the tag would break every styled component with a module-level export
    it('splices into an existing <script module> instead of adding a second one', async () => {
      const code = await run(
        '<script module>\n  export const NAME = "card";\n</script>\n' +
          '<View class="card" />\n<style>.card { padding: 4px; }</style>\n',
      );
      expect(code.match(/<script module/g)).toHaveLength(1);
      expect(code).toContain('export const NAME = "card";');
      expect(() => compile(code, COMPILE_OPTIONS)).not.toThrow();
    });

    // No source map is emitted, so only line-preserving edits keep a diagnostic on its line
    // A shifted line number would misdirect every later error in the file
    it('keeps every original line at its original number', async () => {
      const source = [
        '<script>',
        '  let x = 1;',
        '</script>',
        '',
        '<View class="card">{x}</View>',
        '',
        '<style>',
        '  .card { padding: 4px; }',
        '</style>',
        '',
      ].join('\n');
      const lines = (await run(source)).split('\n');

      expect(lines[4]).toContain('<View class="card__');
      // The injected module script is appended AFTER everything, so nothing above it moves.
      expect(
        lines
          .slice(0, 9)
          .some(line => line.includes('__symbioteRegisterRules')),
      ).toBe(false);
    });

    // why: this preprocessor exists specifically to make the compiler's own CSS output a no-op
    // for us — proving the rewritten source compiles WITHOUT css_unused_selector or a leftover
    // Svelte scope hash is the real end-to-end claim, not just "the string contains X".
    it('compiles clean afterwards — no css_unused_selector, no leftover scope hash', async () => {
      const code = await run(
        '<View class="card" />\n<style>.card { padding: 4px; }</style>\n',
      );
      const result = compile(code, { ...COMPILE_OPTIONS, filename: FILENAME });

      expect(result.warnings.map(warning => warning.code)).not.toContain(
        'css_unused_selector',
      );
      expect(result.css).toBeNull();
      expect(result.js.code).toContain(`card__${scopeIdOf(code)}`);
    });

    // why: svelte.config.js registers this preprocessor, so svelte-check and the language server
    // run it and then typecheck what comes back — the injected block has to survive a lang="ts"
    // component, since Svelte only strips types from a script it believes is TypeScript.
    it('mirrors lang="ts" onto the module script it injects, and still compiles', async () => {
      const code = await run(
        '<script lang="ts">\n  let { on }: { on?: boolean } = $props();\n</script>\n' +
          '<View class="card">{on}</View>\n<style>.card { padding: 4px; }</style>\n',
      );

      expect(code).toContain('<script module lang="ts">');
      const result = compile(code, { ...COMPILE_OPTIONS, filename: FILENAME });
      expect(result.warnings.map(warning => warning.code)).toEqual([]);
    });

    // Vite follows an extensionless relative import, plain Node loading `svelte.config.js` does not
    // So editor tooling could break with every other test here green, hence a real Node spawn
    // This is why `../scope-token` is an import-free module reached through the `exports` map
    it('loads and runs from svelte.config.js under plain Node', () => {
      const packageRoot = join(__dirname, '../..');
      const script = [
        "const cfg = (await import('./svelte.config.js')).default;",
        "const out = await cfg.preprocess[1].markup({ content: '<View class=\"card\" /><style>.card{padding:2px}</style>', filename: '/x/A.svelte' });",
        'process.stdout.write(out.code);',
      ].join('\n');

      const output = execFileSync(
        process.execPath,
        ['--input-type=module', '-e', script],
        {
          cwd: packageRoot,
          encoding: 'utf8',
        },
      );

      expect(output).toContain('class="card__svelte-');
      expect(output).toContain(
        '__symbioteRegisterRules([{"tokens":["card__svelte-',
      );
    });
  });

  describe('Positive — an @media rule keeps its condition', () => {
    // Без `cond` и таблицы правило регистрируется безусловным и красится на всех устройствах
    it('ships the condition table and the rule cond index', async () => {
      const code = await run(
        '<View class="card" />\n<style>.card { padding: 4px; } @media (min-width: 600px) { .card { padding: 8px; } }</style>\n',
      );
      expect(code).toContain('"cond":0');
      expect(code).toContain('[[">=","width",600]]);');
    });

    // Файл без `@media` должен выдавать прежний текст, без пустого аргумента с таблицей
    it('emits no condition table for a file without @media', async () => {
      const code = await run(
        '<View class="card" />\n<style>.card { padding: 4px; }</style>\n',
      );
      expect(code).not.toContain('"cond"');
      expect(code).toMatch(/__symbioteRegisterRules\(\[.*\]\);/);
    });
  });

  describe('Positive — a :root block registers its custom properties', () => {
    it('imports and calls the registration next to the rules', async () => {
      const code = await run(
        '<View class="card" />\n<style>:root { --gap: 8px; } .card { padding: var(--gap); }</style>\n',
      );
      expect(code).toContain(
        'registerRootVariables as __symbioteRegisterRootVariables',
      );
      expect(code).toContain(
        '__symbioteRegisterRootVariables([{"name":"--gap","value":"8px"}]);',
      );
    });

    // Без вызова файл, где есть только токены, терял бы их молча
    it('registers a file whose only content is :root', async () => {
      const code = await run(
        '<View />\n<style>:root { --gap: 8px; }</style>\n',
      );
      expect(code).toContain('__symbioteRegisterRootVariables(');
    });

    it('shares the condition table with the rules', async () => {
      const code = await run(
        '<View />\n<style>@media (min-width: 600px) { :root { --gap: 16px; } }</style>\n',
      );
      expect(code).toContain(
        '__symbioteRegisterRootVariables([{"name":"--gap","value":"16px","cond":0}], [[">=","width",600]]);',
      );
    });

    it('emits nothing for a file without :root variables', async () => {
      const code = await run(
        '<View class="card" />\n<style>.card { padding: 4px; }</style>\n',
      );
      expect(code).not.toContain('RootVariables');
    });
  });

  describe('Negative (an unsupported <style lang> rejects instead of silently dropping the block)', () => {
    // why: silently dropping an unsupported preprocessor language would ship a component with no
    // styling and no error — the loud rejection is the product contract, not the default of
    // "compile whatever comes through".
    it('rejects an unknown <style lang> instead of silently dropping the block', async () => {
      await expect(
        run('<style lang="postcss">.card {}</style>'),
      ).rejects.toThrow(/<style lang="postcss"> is not supported/);
    });
  });
});
