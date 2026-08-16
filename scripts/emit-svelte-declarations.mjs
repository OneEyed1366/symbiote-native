// copy-svelte-sources.mjs copies the raw .svelte files into build/; this emits their TYPES.
//
// Without it, a consumer importing a published .svelte component falls back to svelte's ambient
// `declare module '*.svelte'` (LegacyComponentType): props become `any` and the `bind:this`
// push/pop/reset/... surface disappears entirely (svelte-adapter-dom-shim skill, §24c).
// tsc alone can't fix this — it never reads .svelte. svelte2tsx's `emitDts` (the same entry
// point `svelte-package` uses) compiles each .svelte to TSX and emits `X.svelte.d.ts` beside it,
// which a concrete `./X.svelte` import resolves to over the ambient wildcard.
//
// Two things need fixing, not one:
// 1. Components themselves — `build/**/X.svelte.d.ts` next to the copied `.svelte`. Repairs
//    every `export { default as X } from './X.svelte'` re-export for free.
// 2. .ts modules that launder a component through a VALUE (e.g. `Stack = Object.assign(StackImpl,
//    { Screen })` in svelte/stack/index.ts) — tsc bakes the ambient type it saw at emit time into
//    build/svelte/stack/index.d.ts, so those declarations are found by scanning for the
//    `LegacyComponentType` marker and replaced with svelte2tsx's own.
//
// emitDts runs over the WHOLE package src, so it writes into a throwaway staging dir first and
// only the wanted files get copied into build/ — otherwise it would clobber tsc's own output for
// every plain .ts file, and for `*.svelte.ts` rune modules (which also compile to `.svelte.d.ts`)
// a `*.svelte.d.ts` glob would pick the wrong file entirely.
//
// emitDts fails silently (console.warn's a "likely not generated" list and resolves), so every
// signal here is turned into a thrown error: the warning, a copied .svelte with no declaration
// beside it, or any LegacyComponentType left in build/ when the run finishes.
//
// Runs AFTER `tsc --build` in `prepublish-build` — reads and patches tsc's emitted build/.
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
