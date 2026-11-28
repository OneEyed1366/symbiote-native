// `copy-svelte-sources.mjs` copies the raw .svelte files into build/, and this emits their TYPES
// Without it a consumer falls back to the ambient `declare module '*.svelte'`
// (`LegacyComponentType`): props become `any` and the `bind:this` surface disappears entirely

// tsc alone cannot fix it, as it never reads .svelte, so this uses svelte2tsx's `emitDts`
// (the entry point `svelte-package` uses) to emit `X.svelte.d.ts` beside each copied component

// Two things need declarations: the components (`build/**/X.svelte.d.ts`) and .ts modules
// that launder a component through a value, e.g. `Stack = Object.assign(StackImpl, { Screen })`
// tsc bakes the ambient type into those, so they are found by the `LegacyComponentType` marker

// `emitDts` runs over the whole package src, so it writes into a throwaway staging dir first
// Only the wanted files are copied into build/, or it would clobber tsc's output for plain .ts
// files, and a `*.svelte.d.ts` glob would pick the wrong file for `*.svelte.ts` rune modules

// `emitDts` fails silently, it only `console.warn`s a "likely not generated" list, so every signal
// becomes a thrown error: the warning, a copied .svelte with no declaration beside it, or any
// `LegacyComponentType` left in build/ when the run finishes

// Runs AFTER `tsc --build` in `prepublish-build` and patches tsc's emitted build/
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { emitDts } from 'svelte2tsx';
import { listSvelteFiles } from './copy-svelte-sources.mjs';
import { publishablePackageEntries } from './lib/publishable-packages.mjs';

const require = createRequire(import.meta.url);

// The v4 declaration file, not the legacy one: it emits `SvelteComponent` and not the deprecated
// `SvelteComponentTyped`, and svelte2tsx picks the branch off this filename, not a version probe
const svelteShimsPath = require.resolve('svelte2tsx/svelte-shims-v4.d.ts');

const STAGING_DIR_NAME = '.svelte-dts';
const DECLARATION_SUFFIX = '.d.ts';
// The default export type of `declare module '*.svelte'` in svelte/types/index.d.ts
// Nothing under a package's src/ names it, so seeing it in a build declaration means tsc inlined
// the ambient fallback because it could not see the real component
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

// `emitDts` has no logger option, so its warnings are caught on the global `console.warn`
// One capture wraps the whole run, as packages emit concurrently and share that global
async function withCapturedWarnings(run) {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...parts) => warnings.push(parts.join(' '));
  try {
    const value = await run();
    return { value, warnings };
  } finally {
    console.warn = originalWarn;
  }
}

function takeStagedDeclaration(stagingDir, buildDir, relative, why) {
  const staged = path.join(stagingDir, relative);
  if (!fs.existsSync(staged)) {
    throw new Error(`svelte2tsx emitted no declaration for ${relative} - ${why}`);
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

  try {
    await emitDts({ libRoot: srcDir, declarationDir: stagingDir, svelteShimsPath });

    for (const source of sources) {
      takeStagedDeclaration(
        stagingDir,
        buildDir,
        path.relative(srcDir, source) + DECLARATION_SUFFIX,
        'a consumer would silently fall back to the ambient `*.svelte` any',
      );
    }

    const inlined = listDeclarationFiles(buildDir).filter(usesAmbientFallback);
    for (const declaration of inlined) {
      takeStagedDeclaration(
        stagingDir,
        buildDir,
        path.relative(buildDir, declaration),
        'its tsc declaration inlined the ambient `*.svelte` any',
      );
    }

    const stillAmbient = listDeclarationFiles(buildDir).filter(usesAmbientFallback);
    if (stillAmbient.length > 0) {
      const survivors = stillAmbient.map(file => `  ${file}`).join('\n');
      throw new Error(`the ambient \`*.svelte\` fallback survived in:\n${survivors}`);
    }
    return { components: sources.length, repaired: inlined.length };
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

// Packages are independent (own staging and build dirs), so they emit concurrently
export async function emitAllSvelteDeclarations(pkgDirs) {
  const { value: results, warnings } = await withCapturedWarnings(() =>
    Promise.all(pkgDirs.map(emitSvelteDeclarations)),
  );
  if (warnings.length > 0) {
    throw new Error(`svelte2tsx could not type every component:\n${warnings.join('\n')}`);
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = await emitAllSvelteDeclarations(
    publishablePackageEntries().map(({ dir }) => dir),
  );
  const totalComponents = results.reduce((sum, result) => sum + result.components, 0);
  const totalRepaired = results.reduce((sum, result) => sum + result.repaired, 0);
  console.log(`.svelte declarations emitted into build/: ${totalComponents}`);
  console.log(`tsc declarations repaired (ambient fallback inlined): ${totalRepaired}`);
}
