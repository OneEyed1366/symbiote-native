// The compile-and-load harness `SQLiteProvider.smoke.test.ts` uses. Copied verbatim (mechanism,
// not content — nothing here is navigation-specific) from
// packages/navigation/src/svelte/svelte-compile.test-helper.ts, which is not part of that
// package's public exports (a co-located test helper), so it can't be imported across the
// package boundary.
//
// There is no `.svelte`-aware bundler wired into this repo's vitest (svelte-adapter-dom-shim
// skill §15, a deliberate choice), so a test that needs to RUN a component compiles the real
// source with `svelte/compiler` itself and dynamic-`import()`s the output. Three rules fall out
// of that, all of them learned the hard way in the navigation adapter's own smokes:
//
//  1. The compiled file must sit NEXT TO the real source, because its own relative imports
//     resolve from wherever the compiled FILE lives, not from where the source did.
//  2. Every `.svelte` specifier inside the compiled output has to be rewritten to the compiled
//     twin, recursively.
//  3. Node's `import()` caches by path, so re-writing new content to a path a previous test
//     already imported hands back the STALE module. Every harness instance therefore stamps its
//     own id into the filenames.

import { compile } from 'svelte/compiler';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
// The real Metro pipeline's own `.svelte.ts` compile step (TS-strip, then `compileModule` to
// desugar the runes). Reused rather than reimplemented. Default-imported because it is a `.cjs`
// module.
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';

const {
  compileSvelteModuleFile,
}: {
  compileSvelteModuleFile: (source: string, filename: string) => string;
} = metroSvelteTransformer;

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;
const SVELTE_SPECIFIER_PATTERN = /(['"])(\.{1,2}\/[^'"]*\.svelte)\1/g;

export type ISvelteHarness = {
  // Compile a real `.svelte` file plus everything it imports; returns the compiled entry path.
  compileFile(sveltePath: string): string;
  // Compile an inline fixture written into `dir`, so its own relative imports resolve from there.
  compileSource(dir: string, name: string, source: string): string;
  cleanup(): void;
};

export function createSvelteHarness(
  id: string,
  aliases: Readonly<Record<string, string>> = {},
): ISvelteHarness {
  const written: string[] = [];
  const compiledBySource = new Map<string, string>();

  function outPathFor(sveltePath: string): string {
    const stem = basename(sveltePath).replace(/\./g, '-');
    return join(dirname(sveltePath), `.smoke-compiled-${id}-${stem}.mjs`);
  }

  function relativeSpecifier(fromFile: string, target: string): string {
    const specifier = relative(dirname(fromFile), target);
    return specifier.startsWith('..') ? specifier : `./${specifier}`;
  }

  function rewrite(code: string, outPath: string): string {
    let rewritten = code.replace(
      SVELTE_SPECIFIER_PATTERN,
      (_match, quote: string, spec: string) => {
        const childSource = resolve(dirname(outPath), spec);
        const childOut = compileFile(childSource);
        return `${quote}${relativeSpecifier(outPath, childOut)}${quote}`;
      },
    );
    for (const [specifier, target] of Object.entries(aliases)) {
      rewritten = rewritten
        .split(`'${specifier}'`)
        .join(`'${relativeSpecifier(outPath, target)}'`);
      rewritten = rewritten
        .split(`"${specifier}"`)
        .join(`"${relativeSpecifier(outPath, target)}"`);
    }
    return rewritten;
  }

  function emit(
    sveltePath: string,
    source: string,
    isRuneModule: boolean,
  ): string {
    const outPath = outPathFor(sveltePath);
    // Registered BEFORE compiling so a cycle between two components terminates.
    compiledBySource.set(sveltePath, outPath);
    written.push(outPath);
    const filename = basename(sveltePath);
    const code = isRuneModule
      ? compileSvelteModuleFile(source, `${filename}.ts`)
      : compile(source, { ...COMPILE_OPTIONS, filename }).js.code;
    writeFileSync(outPath, rewrite(code, outPath));
    return outPath;
  }

  function compileFile(sveltePath: string): string {
    const cached = compiledBySource.get(sveltePath);
    if (cached !== undefined) return cached;
    const runeModulePath = `${sveltePath}.ts`;
    if (!existsSync(sveltePath) && existsSync(runeModulePath)) {
      return emit(sveltePath, readFileSync(runeModulePath, 'utf8'), true);
    }
    return emit(sveltePath, readFileSync(sveltePath, 'utf8'), false);
  }

  return {
    compileFile,
    compileSource(dir, name, source) {
      return emit(join(dir, `${name}.svelte`), source, false);
    },
    cleanup() {
      for (const file of written) rmSync(file, { force: true });
      written.length = 0;
      compiledBySource.clear();
    },
  };
}

// The compiled module's default export, narrowed without a cast so a test never silently mounts
// `undefined`.
export async function loadComponent(compiledPath: string): Promise<unknown> {
  const mod: unknown = await import(pathToFileURL(compiledPath).href);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`${compiledPath} produced no default export`);
  }
  return mod.default;
}
