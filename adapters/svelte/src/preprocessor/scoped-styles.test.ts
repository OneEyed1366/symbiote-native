// The build-time half of `<style>` support: what the preprocessor hands to `compile()`.
// The runtime proof — a real mounted component whose committed Fabric node carries the resolved
// style, and two components' `.card` rules not bleeding into each other — lives in
// `../scoped-styles.smoke.test.ts`.

import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { scopedStyles } from './scoped-styles';

const preprocess = scopedStyles();
const FILENAME = '/repo/src/Card.svelte';
const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

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
  it('leaves a component with no <style> block byte-identical', async () => {
    const source = '<script>let x = 1;</script>\n<View class="card">{x}</View>\n';
    expect(await run(source)).toBe(source);
  });

  it('registers the block under a per-file-suffixed key and rewrites the static class', async () => {
    const code = await run(
      '<View class="card" />\n<style>\n  .card { padding: 12px; }\n</style>\n',
    );
    const scopeId = scopeIdOf(code);

    expect(code).toContain(`class="card__${scopeId}"`);
    expect(code).toContain(`{"card__${scopeId}":{"padding":12}}`);
    expect(code).toContain(
      "import { registerStyles as __symbioteRegisterStyles } from '@symbiote-native/engine'",
    );
    expect(code).not.toContain('<style');
  });

  it('scopes both tokens of a compound selector whose parts have no standalone rule', async () => {
    // `big` is locally defined only through `.card.big` — the block registers ONE collapsed
    // `cardBig` key, which appears nowhere in the markup. Recording the key alone left `big`
    // unscoped and the rule permanently unreachable.
    const code = await run(
      '<View class="card big" />\n<style>\n  .card.big { padding: 16px; }\n</style>\n',
    );
    const scopeId = scopeIdOf(code);

    expect(code).toContain(`class="card__${scopeId} big__${scopeId}"`);
    expect(code).toContain(`{"cardBig__${scopeId}":{"padding":16}}`);
  });

  it('gives two different files two different scope ids for the same class name', async () => {
    const source = '<View class="card" />\n<style>.card { padding: 1px; }</style>\n';
    const first = scopeIdOf(await run(source, '/repo/src/A.svelte'));
    const second = scopeIdOf(await run(source, '/repo/src/B.svelte'));
    expect(first).not.toBe(second);
  });

  it('leaves a :global(...) selector unsuffixed and its markup token untouched', async () => {
    const code = await run(
      '<View class="reset card" />\n' +
        '<style>\n  :global(.reset) { margin: 0; }\n  .card { padding: 4px; }\n</style>\n',
    );
    const scopeId = scopeIdOf(code);

    expect(code).toContain(`class="reset card__${scopeId}"`);
    expect(code).toContain('"reset":{"margin":0}');
    expect(code).not.toContain(`reset__${scopeId}`);
  });

  it('passes a class token this file does not define straight through', async () => {
    const code = await run(
      '<View class="card global-thing" />\n<style>.card { padding: 4px; }</style>\n',
    );
    expect(code).toContain(`class="card__${scopeIdOf(code)} global-thing"`);
  });

  it('matches a kebab-authored token against its camelCase registry key', async () => {
    const code = await run(
      '<View class="card-title" />\n<style>.card-title { color: red; }</style>\n',
    );
    const scopeId = scopeIdOf(code);
    expect(code).toContain(`class="cardTitle__${scopeId}"`);
    expect(code).toContain(`"cardTitle__${scopeId}"`);
  });

  it('wraps a dynamic class expression in the runtime scoper, verbatim', async () => {
    const code = await run(
      "<View class={['card', on && 'lit']} />\n<style>.card { padding: 4px; } .lit { color: red; }</style>\n",
    );
    expect(code).toContain(
      "class={__symbioteScopeClass(['card', on && 'lit'], __symbioteScopedNames, __symbioteScopeId)}",
    );
    expect(code).toContain('const __symbioteScopedNames = new Set(["card","lit"])');
  });

  it('rebuilds an interpolated class as a template literal', async () => {
    const code = await run(
      '<View class="card {extra} tail" />\n<style>.card { padding: 4px; }</style>\n',
    );
    expect(code).toContain(
      'class={__symbioteScopeClass(`card ${extra} tail`, __symbioteScopedNames, __symbioteScopeId)}',
    );
  });

  it('emits no runtime scoper when nothing in the file is locally scoped', async () => {
    const code = await run('<View class={cls} />\n<style>:global(.reset) { margin: 0; }</style>\n');
    expect(code).toContain('class={cls}');
    expect(code).not.toContain('__symbioteScopeClass');
    expect(code).toContain('"reset":{"margin":0}');
  });

  it('scopes a class inside an {#each} body, not just at the top level', async () => {
    const code = await run(
      '{#each items as item}<View class="card">{item}</View>{/each}\n<style>.card { padding: 4px; }</style>\n',
    );
    expect(code).toContain(`class="card__${scopeIdOf(code)}"`);
  });

  it('splices into an existing <script module> instead of adding a second one', async () => {
    const code = await run(
      '<script module>\n  export const NAME = "card";\n</script>\n' +
        '<View class="card" />\n<style>.card { padding: 4px; }</style>\n',
    );
    expect(code.match(/<script module/g)).toHaveLength(1);
    expect(code).toContain('export const NAME = "card";');
    expect(() => compile(code, COMPILE_OPTIONS)).not.toThrow();
  });

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
    expect(lines.slice(0, 9).some(line => line.includes('__symbioteRegisterStyles'))).toBe(false);
  });

  it('compiles clean afterwards — no css_unused_selector, no leftover scope hash', async () => {
    const code = await run('<View class="card" />\n<style>.card { padding: 4px; }</style>\n');
    const result = compile(code, { ...COMPILE_OPTIONS, filename: FILENAME });

    expect(result.warnings.map(warning => warning.code)).not.toContain('css_unused_selector');
    expect(result.css).toBeNull();
    expect(result.js.code).toContain(`card__${scopeIdOf(code)}`);
  });

  // svelte.config.js registers this preprocessor, so the language server and svelte-check run it
  // too and then typecheck what comes back. The injected block therefore has to survive a
  // `lang="ts"` component — Svelte only strips types from a script it believes is TypeScript.
  it('mirrors lang="ts" onto the module script it injects, and still compiles', async () => {
    const code = await run(
      '<script lang="ts">\n  let { on }: { on?: boolean } = $props();\n</script>\n' +
        '<View class="card">{on}</View>\n<style>.card { padding: 4px; }</style>\n',
    );

    expect(code).toContain('<script module lang="ts">');
    const result = compile(code, { ...COMPILE_OPTIONS, filename: FILENAME });
    expect(result.warnings.map(warning => warning.code)).toEqual([]);
  });

  // A REGRESSION GUARD, not a nicety. Vitest resolves this module through Vite, which happily
  // follows an extensionless relative import; plain Node — which is what actually loads
  // svelte.config.js for svelte-check and the language server — does not, and dies with
  // ERR_MODULE_NOT_FOUND. So the whole preprocessor could be broken for every consuming app's
  // editor tooling with every test in this file still green. This spawns real Node against the
  // real config. It is why `../scope-token` exists as an import-free module reached through the
  // package's own `exports` map: adding a bare relative import anywhere in the preprocessor's
  // graph breaks this and nothing else.
  it('loads and runs from svelte.config.js under plain Node', () => {
    const packageRoot = join(__dirname, '../..');
    const script = [
      "const cfg = (await import('./svelte.config.js')).default;",
      "const out = await cfg.preprocess[1].markup({ content: '<View class=\"card\" /><style>.card{padding:2px}</style>', filename: '/x/A.svelte' });",
      'process.stdout.write(out.code);',
    ].join('\n');

    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: packageRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('class="card__svelte-');
    expect(output).toContain('__symbioteRegisterStyles({"card__svelte-');
  });

  it('rejects an unknown <style lang> instead of silently dropping the block', async () => {
    await expect(run('<style lang="postcss">.card {}</style>')).rejects.toThrow(
      /<style lang="postcss"> is not supported/,
    );
  });
});
