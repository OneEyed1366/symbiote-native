// The compile-and-load harness every `*.smoke.test.ts` in this folder uses.
//
// There is no `.svelte`-aware bundler wired into this repo's vitest (a deliberate choice), so a
// test that needs to RUN a component compiles the real source with `svelte/compiler` itself and
// dynamic-`import()`s the output. Three rules fall out of that, all of them learned the hard way
// in the adapter's own smokes:
//
//  1. The compiled file must sit NEXT TO the real source, because its own relative imports
//     (`./stack-screen.svelte`, `../navigation-context`) resolve from wherever the compiled FILE
//     lives, not from where the source did.
//  2. Every `.svelte` specifier inside the compiled output has to be rewritten to the compiled
//     twin, recursively - a navigator pulls in stack-screen.svelte, which pulls in
//     navigation-scope.svelte.
//  3. Node's `import()` caches by path, so re-writing new content to a path a previous test
//     already imported hands back the STALE module. Every harness instance therefore stamps its
//     own id into the filenames.
//
// `aliases` covers the one case relative rewriting cannot: `@symbiote-native/svelte`'s main
// barrel re-exports real `.svelte` sources, which Vite's plain (svelte-plugin-free) transform
// cannot parse at all - so a test that needs something from it points the specifier at a module
// it compiled itself instead.
//
// EVERYTHING here is async, cascading from `compileSvelteModuleFile`: the metro transformer's own
// `svelte/compiler` import is a LAZY dynamic `import()`, not a top-level `require()` (the
// git-pinned checkout ships no prebuilt `compiler/index.js` CJS bundle - svelte-adapter-custom-
// renderer skill §0), so its compile functions are async. `emit`/`compileFile`/`rewrite` all
// thread that `await` through; `compile()` itself (statically ESM-imported below, real
// `.svelte` markup) stays synchronous once resolved, so only the rune-module branch actually
// awaits anything, but the shared recursive plumbing has to be async throughout regardless.

import { compile } from 'svelte/compiler';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
// The real Metro pipeline's own `.svelte.ts` compile step (TS-strip, then `compileModule` to
// desugar the runes). Reused rather than reimplemented, so the runes in ./runes are exercised
// through the ACTUAL shipped compile path - a bare, uncompiled `$state`/`$effect` call throws
// `rune_outside_svelte` at runtime. Default-imported because it is a `.cjs` module.
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';

const {
  compileSvelteModuleFile,
}: {
  compileSvelteModuleFile: (source: string, filename: string) => Promise<string>;
} = metroSvelteTransformer;

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
  // svelte-adapter-custom-renderer skill §3: every compiled component auto-imports and pushes
  // this module's renderer at its own top, regardless of what mount() is later called with -
  // without this option, compiled output tries to run against a real DOM and throws
  // `ReferenceError: document is not defined` at first mount.
  experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
} as const;
// The §16 tell: a single-space text entry inside a compiled `from_tree([...])` array, i.e. real
// whitespace between two sibling nodes that became a real RCTRawText engine node.
const STRAY_WHITESPACE_PATTERN = /,\s*'\s+'\s*,/g;
const SVELTE_SPECIFIER_PATTERN = /(['"])(\.{1,2}\/[^'"]*\.svelte)\1/g;

export type ISvelteHarness = {
  // Compile a real `.svelte` file plus everything it imports; returns the compiled entry path.
  compileFile(sveltePath: string): Promise<string>;
  // Compile an inline fixture written into `dir`, so its own relative imports resolve from there.
  compileSource(dir: string, name: string, source: string): Promise<string>;
  // The number of stray single-space text entries across everything compiled so far - must be 0.
  strayWhitespaceCount(): number;
  cleanup(): void;
};

export function createSvelteHarness(
  id: string,
  aliases: Readonly<Record<string, string>> = {},
): ISvelteHarness {
  const written: string[] = [];
  const compiledBySource = new Map<string, string>();
  let strayWhitespace = 0;

  function outPathFor(sveltePath: string): string {
    const stem = basename(sveltePath).replace(/\./g, '-');
    return join(dirname(sveltePath), `.smoke-compiled-${id}-${stem}.mjs`);
  }

  // `./` is prepended unless the path already walks up: every compiled file's basename STARTS
  // with a dot (`.smoke-compiled-...`), so a bare "starts with '.'" check would leave it looking
  // like a bare package specifier to the resolver.
  function relativeSpecifier(fromFile: string, target: string): string {
    const specifier = relative(dirname(fromFile), target);
    return specifier.startsWith('..') ? specifier : `./${specifier}`;
  }

  // `.replace()`'s callback can't `await`, so the `.svelte` specifiers are resolved first (each
  // recursive `compileFile` awaited in turn) and then spliced into the string synchronously -
  // `.split(full).join(...)` rather than a second `.replace()` pass, since `full` already carries
  // its own quotes and is safe to match literally.
  async function rewrite(code: string, outPath: string): Promise<string> {
    let rewritten = code;
    for (const [full, quote, spec] of code.matchAll(SVELTE_SPECIFIER_PATTERN)) {
      const childSource = resolve(dirname(outPath), spec);
      const childOut = await compileFile(childSource);
      rewritten = rewritten
        .split(full)
        .join(`${quote}${relativeSpecifier(outPath, childOut)}${quote}`);
    }
    for (const [specifier, target] of Object.entries(aliases)) {
      rewritten = rewritten.split(`'${specifier}'`).join(`'${relativeSpecifier(outPath, target)}'`);
      rewritten = rewritten.split(`"${specifier}"`).join(`"${relativeSpecifier(outPath, target)}"`);
    }
    return rewritten;
  }

  async function emit(sveltePath: string, source: string, isRuneModule: boolean): Promise<string> {
    const outPath = outPathFor(sveltePath);
    // Registered BEFORE compiling so a cycle between two components terminates.
    compiledBySource.set(sveltePath, outPath);
    written.push(outPath);
    const filename = basename(sveltePath);
    const code = isRuneModule
      ? await compileSvelteModuleFile(source, `${filename}.ts`)
      : compile(source, { ...COMPILE_OPTIONS, filename }).js.code;
    strayWhitespace += (code.match(STRAY_WHITESPACE_PATTERN) ?? []).length;
    writeFileSync(outPath, await rewrite(code, outPath));
    return outPath;
  }

  // A `./x.svelte` specifier is a COMPONENT when `x.svelte` exists on disk and a rune MODULE
  // when `x.svelte.ts` does - the same two-way split the Metro transformer makes on the real
  // filename.
  async function compileFile(sveltePath: string): Promise<string> {
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
    strayWhitespaceCount: () => strayWhitespace,
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
  // pathToFileURL rather than a `file://${...}` template: the literal form makes Vite's import
  // analyzer log an "Invalid file URL" warning for the un-substituted placeholder.
  const mod: unknown = await import(pathToFileURL(compiledPath).href);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`${compiledPath} produced no default export`);
  }
  return mod.default;
}
