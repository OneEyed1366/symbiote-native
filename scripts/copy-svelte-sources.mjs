// tsc --build silently drops every .svelte file — TypeScript only processes/emits .ts/.tsx/.d.ts,
// so a package whose components are authored as .svelte (currently only @symbiote-native/svelte)
// gets build/**/*.js for every sibling .ts file but no build/**/*.svelte at all, and `tsc --build`
// still exits 0.
//
// Unlike Vue's adapter (plain .ts/.tsx render functions), Svelte has no non-SFC authoring form —
// the adapter's own components genuinely ARE .svelte files, so the package must ship the raw
// .svelte source in build/ for a consuming app's own Metro bundler to compile it, via the same
// metro-svelte-transformer the consumer already needs for its own .svelte files (Metro's
// transform step doesn't distinguish node_modules from app code by extension).
//
// Runs over every publishable package, not just svelte by name, so a future package authored the
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
