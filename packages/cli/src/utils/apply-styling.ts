import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IStylingOption } from '../types.js';
import { renderTemplate } from './render-template.js';

// vue-sfc/svelte style their base App with an inline `<style scoped>`/`<style>` block (the
// idiomatic web-Vue/Svelte convention) instead of an external file. Both compilers already
// dispatch a `<style lang="scss|less|stylus">` block through the same preprocessor pipeline a
// standalone file gets (`adapters/vue/metro-vue-transformer.cjs`'s `SFC_STYLE_LANG_TO_PREPROCESSOR`,
// `adapters/svelte/src/preprocessor/scoped-styles.ts`'s `STYLE_LANG_TO_PREPROCESSOR`) — so a
// preprocessor choice for these two is just adding the `lang` attribute in place, never a file
// swap. Every other framework's default already IS an external `App.css` + class, so it goes
// through the rename path below instead.
const INLINE_STYLE_BLOCK_FRAMEWORKS: ReadonlySet<string> = new Set([
  'vue-sfc',
  'svelte',
]);

const STYLE_TAG_PATTERN = /<style(?=[ >])/;

function addStyleLangAttribute(dir: string, lang: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIR_NAMES.has(entry.name)) continue;
      addStyleLangAttribute(entryPath, lang);
      continue;
    }
    if (!entry.name.endsWith('.vue') && !entry.name.endsWith('.svelte'))
      continue;
    const content = fs.readFileSync(entryPath, 'utf8');
    if (STYLE_TAG_PATTERN.test(content)) {
      fs.writeFileSync(
        entryPath,
        content.replace(STYLE_TAG_PATTERN, `<style lang="${lang}"`),
      );
    }
  }
}

const PREPROCESSOR_EXTENSIONS = {
  scss: 'scss',
  less: 'less',
  stylus: 'styl',
} as const satisfies Record<string, string>;

const SKIPPED_DIR_NAMES: ReadonlySet<string> = new Set([
  'ios',
  'android',
  'node_modules',
]);

const APP_COMPONENT_FILENAMES: ReadonlySet<string> = new Set([
  'App.tsx',
  'App.jsx',
  'App.ts',
  'App.vue',
  'App.svelte',
]);

// The trivial flat rule below is identical across every framework's App.module.css, so it's
// written here once instead of duplicated across 12 template files.
const STARTER_CSS_CONTENT = `.container {
  flex: 1;
  align-items: center;
  justify-content: center;
}
`;

function findAppComponentDir(dir: string): string | undefined {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIR_NAMES.has(entry.name)) continue;
      const found = findAppComponentDir(entryPath);
      if (found !== undefined) return found;
      continue;
    }
    if (APP_COMPONENT_FILENAMES.has(entry.name)) return dir;
  }
  return undefined;
}

function findAppCssFile(dir: string): string | undefined {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIR_NAMES.has(entry.name)) continue;
      const found = findAppCssFile(path.join(dir, entry.name));
      if (found !== undefined) return found;
      continue;
    }
    if (entry.name === 'App.css') return path.join(dir, entry.name);
  }
  return undefined;
}

function replaceInTextFiles(dir: string, from: string, to: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIR_NAMES.has(entry.name)) continue;
      replaceInTextFiles(entryPath, from, to);
      continue;
    }
    const content = fs.readFileSync(entryPath, 'utf8');
    if (content.includes(from))
      fs.writeFileSync(entryPath, content.split(from).join(to));
  }
}

// scss/less/stylus produce byte-identical output to plain CSS for the trivial flat rule App.css
// carries, so there's no separate template content for them — just rename the file (css-parser's
// preprocessor step reduces any of the four to plain CSS before compiling either way) and rewrite
// the one import string that names it.
function renameStylesheetExtension(root: string, extension: string): void {
  const cssFile = findAppCssFile(root);
  if (cssFile === undefined) return;
  fs.renameSync(cssFile, path.join(path.dirname(cssFile), `App.${extension}`));
  replaceInTextFiles(root, "'./App.css'", `'./App.${extension}'`);
}

export type IApplyStylingOptions = {
  readonly styling: IStylingOption;
  readonly jsTemplateDir: string;
  readonly hasNavigation: boolean;
  readonly hasTypescript: boolean;
  readonly templatesRoot: string;
};

export function applyStyling(
  root: string,
  options: IApplyStylingOptions,
): void {
  const {
    styling,
    jsTemplateDir,
    hasNavigation,
    hasTypescript,
    templatesRoot,
  } = options;
  if (styling === 'css') return;

  if (styling === 'css-modules' || styling === 'stylesheet') {
    renderTemplate(
      path.join(templatesRoot, 'styling', 'js', jsTemplateDir, styling),
      root,
      {
        hasTypescript,
      },
    );
    if (hasNavigation) {
      renderTemplate(
        path.join(
          templatesRoot,
          'styling',
          'navigation',
          jsTemplateDir,
          styling,
        ),
        root,
        { hasTypescript },
      );
    }
    // The base layer's default App.css is now orphaned — 'stylesheet' needs no external file at
    // all, and 'css-modules' ships its own App.module.css below.
    const orphanedCss = findAppCssFile(root);
    if (orphanedCss !== undefined) fs.rmSync(orphanedCss, { force: true });

    if (styling === 'css-modules') {
      const appDir = findAppComponentDir(root);
      if (appDir !== undefined) {
        fs.writeFileSync(
          path.join(appDir, 'App.module.css'),
          STARTER_CSS_CONTENT,
        );
      }
    }
    return;
  }

  // styling is 'scss' | 'less' | 'stylus' here.
  if (INLINE_STYLE_BLOCK_FRAMEWORKS.has(jsTemplateDir)) {
    addStyleLangAttribute(root, styling);
    // The navigation layer's vue-sfc/svelte App still ships an EXTERNAL App.css (shared across
    // its Menu/Details screens, unlike the inline-scoped single-screen base app) — rename it too,
    // or a preprocessor choice silently no-ops for a --navigation scaffold. A no-op find (base
    // app, no navigation) costs nothing.
    renameStylesheetExtension(root, PREPROCESSOR_EXTENSIONS[styling]);
    return;
  }
  renameStylesheetExtension(root, PREPROCESSOR_EXTENSIONS[styling]);
}
