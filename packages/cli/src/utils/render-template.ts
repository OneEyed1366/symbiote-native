import * as fs from 'node:fs';
import * as path from 'node:path';
import { deepMerge } from './deep-merge.js';
import { isJsonObject, type IJsonObject } from './json.js';
import { sortDependencies } from './sort-dependencies.js';

function readJsonObject(filePath: string): IJsonObject {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!isJsonObject(parsed))
    throw new Error(`${filePath}: expected a JSON object`);
  return parsed;
}

const TYPESCRIPT_ONLY_FILENAMES = new Set([
  'tsconfig.json',
  'tsconfig.angular.json',
  'tsconfig.typecheck.json',
  'App.tsx',
]);

function isTypescriptOnlyFile(filename: string): boolean {
  return TYPESCRIPT_ONLY_FILENAMES.has(filename) || filename.endsWith('.d.ts');
}

// react/vue-tsx/solid keep App.tsx and App.jsx as two INDEPENDENT files, not one derived from the
// other — a naive copy-with-renamed-extension looks equivalent only while App.tsx carries zero
// real type annotations; the moment someone adds one, a mechanical rename would ship it into a
// --javascript scaffold as invalid syntax with no warning. Two files can be reviewed on their own,
// same as the tsconfig-only-in-TS split above. vue-sfc/svelte's plain App.vue/App.svelte (no
// `lang="ts"`) are this same JS-default half of the pair — their TypeScript half is the
// `.typescript.` sibling below, not a second same-named file (filesystem can't hold two).
const JAVASCRIPT_ONLY_FILENAMES = new Set([
  'App.jsx',
  'App.vue',
  'App.svelte',
  'MenuScreen.vue',
  'DetailsScreen.vue',
  'MenuScreen.svelte',
  'DetailsScreen.svelte',
]);

function isJavascriptOnlyFile(filename: string): boolean {
  return JAVASCRIPT_ONLY_FILENAMES.has(filename);
}

// vue-sfc/svelte can't use two differently-EXTENSIONED files the way react/vue-tsx/solid do —
// their language is an internal `<script lang="ts">` attribute, so both variants would collide on
// the same destination filename (App.vue / App.svelte). A `.typescript.` infix names the
// TypeScript variant as its own real file (App.typescript.vue) that renders to the plain name
// (App.vue) only when TypeScript is on — generalizes the same override this project already used
// for package.json.fragment.typescript.json, so both go through one mechanism.
function stripTypescriptInfix(filename: string): string {
  return filename.replace('.typescript.', '.');
}

export type IRenderTemplateOptions = {
  readonly hasTypescript: boolean;
};

const DEFAULT_OPTIONS: IRenderTemplateOptions = { hasTypescript: true };

// Recursively copies a template layer (native/, js/<framework>, or a templates/layers/<name>
// overlay) onto a generated app's root, layer after layer. Mirrors create-vue's
// utils/renderTemplate.ts: package.json merges instead of overwriting, .gitignore appends,
// everything else is a plain overwrite-on-conflict copy (later layers win last-write).
//
// No EJS/data-file support yet — templates/README.md tracks that as follow-up work, alongside
// app-name/bundle-id parameterization.
export function renderTemplate(
  src: string,
  dest: string,
  options: IRenderTemplateOptions = DEFAULT_OPTIONS,
): void {
  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      renderTemplate(
        path.resolve(src, entry),
        path.resolve(dest, entry),
        options,
      );
    }
    return;
  }

  const filename = path.basename(src);

  // Every templates/**/README.md documents the TEMPLATE FOLDER itself for maintainers (what
  // was copied and why — see templates/js/react/README.md) — it's not app content and was
  // never meant to ship. A generated app's own README is a future generate.ts's job (still
  // unbuilt, see templates/README.md).
  if (filename === 'README.md') return;

  if (
    !options.hasTypescript &&
    (isTypescriptOnlyFile(filename) || filename.includes('.typescript.'))
  ) {
    return;
  }
  if (options.hasTypescript && isJavascriptOnlyFile(filename)) return;

  // package.json.fragment.typescript.json / App.typescript.vue / App.typescript.svelte all take
  // this path: TypeScript is on (the exclusion above already returned otherwise) and the plain
  // name is what they should land as, overwriting whatever the JS-default sibling already wrote.
  const destFilename = filename.includes('.typescript.')
    ? stripTypescriptInfix(filename)
    : filename;
  const resolvedDest = path.join(path.dirname(dest), destFilename);

  if (destFilename === 'package.json.fragment.json') {
    const destPackageJsonPath = path.resolve(
      path.dirname(resolvedDest),
      'package.json',
    );
    const fragment = readJsonObject(src);
    const existing = fs.existsSync(destPackageJsonPath)
      ? readJsonObject(destPackageJsonPath)
      : {};
    const merged = sortDependencies(deepMerge(existing, fragment));
    fs.writeFileSync(
      destPackageJsonPath,
      `${JSON.stringify(merged, null, 2)}\n`,
    );
    return;
  }

  if (destFilename === '.gitignore' && fs.existsSync(resolvedDest)) {
    const existing = fs.readFileSync(resolvedDest, 'utf8');
    const addition = fs.readFileSync(src, 'utf8');
    fs.writeFileSync(resolvedDest, `${existing}\n${addition}`);
    return;
  }

  fs.copyFileSync(src, resolvedDest);
}
