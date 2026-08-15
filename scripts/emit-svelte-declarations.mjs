// copy-svelte-sources.mjs gets the raw .svelte files into build/; this gets their TYPES there.
//
// Without it a consumer importing a published .svelte component resolves it through svelte's
// ambient `declare module '*.svelte'` fallback (svelte/types/index.d.ts: `const Comp:
// LegacyComponentType`). Everything the component actually exposes is erased: props are `any`,
// and the `export function push/pop/reset/…` surface that `bind:this` returns at runtime is not
// there at all, so annotating the binding as `INavigatorHandle | null` fails with "Type
// 'SvelteComponent<…>' is missing the following properties … push, pop, popToTop, popTo, and 4
// more." (svelte-adapter-dom-shim skill, §24c).
//
// tsc cannot fix this: it only ever reads .ts/.tsx/.d.ts. svelte2tsx's `emitDts` can — it is the
// same entry point `@sveltejs/package` (`svelte-package`) uses. It transforms each .svelte file
// into TSX, runs a real TypeScript program over the result, and emits `X.svelte.d.ts` beside
// where `X.svelte` sits. TypeScript resolves a relative `./X.svelte` import to `./X.svelte.d.ts`,
// and a concrete file always beats the ambient `*.svelte` wildcard.
//
// TWO THINGS HAVE TO BE FIXED, not one.
//
// 1. The components themselves — `build/**/X.svelte.d.ts` next to the copied `build/**/X.svelte`.
//    That alone repairs every `export { default as X } from './X.svelte'` re-export, because tsc
//    keeps the specifier verbatim in its .d.ts and the consumer re-resolves it.
//
// 2. The .ts modules that launder a component through a VALUE. `Stack` is
//    `Object.assign(StackImpl, { Screen })` in svelte/stack/index.ts, so tsc INLINES the type it
//    saw at emit time — the ambient one — into build/svelte/stack/index.d.ts, and no amount of
//    later .svelte.d.ts fixes that frozen text. Those files are found mechanically: an inlined
//    ambient fallback is the only thing in this repo that can put `LegacyComponentType` into a
//    declaration (nothing under src/ names it), so each build declaration containing it is
//    replaced by svelte2tsx's own — whose program resolved the .svelte for real. Its version of
//    svelte/stack/index.d.ts carries the full push/pop/popTo/reset surface AND `Stack.Screen`.
//    Only the .d.ts is taken; tsc's .js output stays authoritative.
//
// WHY A STAGING DIR RATHER THAN EMITTING STRAIGHT INTO build/: emitDts runs over the WHOLE
// package src, so it emits a declaration for every plain .ts file too. We want tsc's output to
// stay authoritative everywhere except the two cases above, so emitDts writes into a throwaway
// folder and only the wanted files are copied across. Deriving the component copy from the
// .svelte source list (rather than from a `*.svelte.d.ts` glob) also matters: a Svelte 5 rune
// module named `linking.svelte.ts` compiles to `linking.svelte.d.ts` too, and a glob would
// clobber tsc's version of it.
//
// FAILING LOUDLY: emitDts does not throw when a component cannot be typed — it console.warn's a
// "likely not generated" list and resolves, leaving the consumer back on the ambient `any` this
// script exists to remove. That silent fallback IS the bug, so every signal is turned into a
// thrown error: the warning itself, a copied .svelte source with no declaration beside it, and
// any `LegacyComponentType` still left in build/ when the run is over.
//
// Runs AFTER `tsc --build` in `prepublish-build` — it reads and patches tsc's emitted build/.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { emitDts } from 'svelte2tsx';
import { listSvelteFiles } from './copy-svelte-sources.mjs';
import { publishablePackageEntries } from './lib/publishable-packages.mjs';

const require = createRequire(import.meta.url);

// v4 shims, not the legacy ones: they emit `SvelteComponent` rather than the deprecated
// `SvelteComponentTyped`. svelte2tsx picks the branch off this filename, not off a version probe.
const svelteShimsPath = require.resolve('svelte2tsx/svelte-shims-v4.d.ts');

const STAGING_DIR_NAME = '.svelte-dts';
const DECLARATION_SUFFIX = '.d.ts';
// svelte/types/index.d.ts's `declare module '*.svelte'` types the default export as this. Nothing
// under any package's src/ names it, so its presence in a build declaration means exactly one
// thing: tsc inlined the ambient fallback because it could not see the real component.
const AMBIENT_FALLBACK_MARKER = 'LegacyComponentType';

function listDeclarationFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listDeclarationFiles(full, out);
    else if (entry.isFile() && entry.name.endsWith(DECLARATION_SUFFIX)) out.push(full);
  }
  return out;
}

function usesAmbientFallback(file) {
  return fs.readFileSync(file, 'utf8').includes(AMBIENT_FALLBACK_MARKER);
}

async function emitToStaging(srcDir, stagingDir) {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...parts) => warnings.push(parts.join(' '));
  try {
    await emitDts({ libRoot: srcDir, declarationDir: stagingDir, svelteShimsPath });
  } finally {
    console.warn = originalWarn;
  }
  if (warnings.length > 0) {
    throw new Error(`svelte2tsx could not type every component under ${srcDir}:\n${warnings.join('\n')}`);
  }
}

function takeStagedDeclaration(stagingDir, buildDir, relative, why) {
  const staged = path.join(stagingDir, relative);
  if (!fs.existsSync(staged)) {
    throw new Error(`svelte2tsx emitted no declaration for ${relative} — ${why}`);
  }
  const dest = path.join(buildDir, relative);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(staged, dest);
}

export async function emitSvelteDeclarations(pkgDir) {
  const srcDir = path.resolve(pkgDir, 'src');
  const sources = listSvelteFiles(srcDir);
  if (sources.length === 0) return { components: 0, repaired: 0 };

  const buildDir = path.resolve(pkgDir, 'build');
  const stagingDir = path.resolve(pkgDir, STAGING_DIR_NAME);
  fs.rmSync(stagingDir, { recursive: true, force: true });

  let components = 0;
  let repaired = 0;
  try {
    await emitToStaging(srcDir, stagingDir);

    for (const source of sources) {
      const relative = path.relative(srcDir, source) + DECLARATION_SUFFIX;
      takeStagedDeclaration(
        stagingDir,
        buildDir,
        relative,
        'a consumer would silently fall back to the ambient `*.svelte` any',
      );
      components++;
    }

    for (const declaration of listDeclarationFiles(buildDir).filter(usesAmbientFallback)) {
      const relative = path.relative(buildDir, declaration);
      takeStagedDeclaration(stagingDir, buildDir, relative, 'its tsc declaration inlined the ambient `*.svelte` any');
      repaired++;
    }

    const stillAmbient = listDeclarationFiles(buildDir).filter(usesAmbientFallback);
    if (stillAmbient.length > 0) {
      throw new Error(
        `the ambient \`*.svelte\` fallback survived in:\n${stillAmbient.map((file) => `  ${file}`).join('\n')}`,
      );
    }
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  return { components, repaired };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let totalComponents = 0;
  let totalRepaired = 0;
  for (const { dir } of publishablePackageEntries()) {
    const { components, repaired } = await emitSvelteDeclarations(dir);
    totalComponents += components;
    totalRepaired += repaired;
  }
  console.log(`.svelte declarations emitted into build/: ${totalComponents}`);
  console.log(`tsc declarations repaired (ambient fallback inlined): ${totalRepaired}`);
}
