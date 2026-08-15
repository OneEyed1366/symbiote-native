// tsc --build silently DROPS every .svelte file — TypeScript only ever processes/emits
// .ts/.tsx/.d.ts, so a package whose components are authored as .svelte (currently only
// @symbiote-native/svelte) ends up with build/**/*.d.ts + build/**/*.js for every sibling .ts
// file, but no build/**/*.svelte at all. That's silent, not an error: `tsc --build` exits 0.
//
// Unlike Vue's adapter (whose own components are plain .ts/.tsx render functions — see
// adapters/vue/src/components/switch/index.ts), Svelte has no non-SFC authoring form: the
// adapter's own components genuinely ARE .svelte files (adapters/svelte/src/components/switch/
// index.svelte), so the package must ship the RAW .svelte source in build/ for a consuming app's
// own Metro bundler to compile — the exact same @symbiote-native/svelte/metro-svelte-transformer
// a consumer already needs for its OWN .svelte files, applied transparently by Metro to anything
// matching .svelte under node_modules too (Metro's transform step doesn't distinguish app code
// from node_modules by extension). This mirrors how examples/vue-sfc's own *.vue screens ship as
// raw source for the CONSUMING app's metro-vue-transformer, just one layer inward (package source
// instead of app source).
//
// Runs over every publishable package (not just svelte by name) so a future package authored the
// same way is covered automatically — same discovery mechanism as fix-esm-extensions.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { publishablePackageEntries } from './lib/publishable-packages.mjs';

// Exported so scripts/emit-svelte-declarations.mjs walks the EXACT same set of files: every
// copied .svelte source must get a declaration beside it, and that check is only meaningful if
// both scripts agree on what "every .svelte source" means.
export function listSvelteFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSvelteFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.svelte')) out.push(full);
  }
  return out;
}

export function copySvelteSources(pkgDir) {
  const srcDir = path.join(pkgDir, 'src');
  const buildDir = path.join(pkgDir, 'build');
  let filesCopied = 0;
  for (const file of listSvelteFiles(srcDir)) {
    const relative = path.relative(srcDir, file);
    const dest = path.join(buildDir, relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
    filesCopied++;
  }
  return filesCopied;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let totalFiles = 0;
  for (const { dir } of publishablePackageEntries()) {
    totalFiles += copySvelteSources(dir);
  }
  console.log(`.svelte files copied to build/: ${totalFiles}`);
}
